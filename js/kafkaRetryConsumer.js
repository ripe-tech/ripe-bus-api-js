import * as os from "os";
import * as fs from "fs";
import { conf } from "yonius";
import { KafkaConsumer } from "./kafkaConsumer";
import { API } from "./base";

export class KafkaRetryConsumer extends KafkaConsumer {
    constructor(options = {}) {
        super();

        this.retries = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES", 5);
        this.retryDelay = conf("KAFKA_CONSUMER_MESSAGE_FIRST_DELAY", 50);
        this.messageFailureMaxTime = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null);
        this.messageDelayExponential = conf("KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL", 2);

        this.retries = options.retries === undefined ? this.retries : options.retries;
        this.retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;
        this.messageFailureMaxTime =
            options.messageFailureMaxTime === undefined
                ? this.messageFailureMaxTime
                : options.messageFailureMaxTime;
        this.messageDelayExponential =
            options.messageDelayExponential === undefined
                ? this.messageDelayExponential
                : options.messageDelayExponential;

        this.retryBuffer = [];
        this._readFromBufferFile();
    }

    /**
     * Subscribes the consumer to the given topic and
     * starts consuming if the `run` flag is set.
     * If the consumer was already running, it is stopped
     * before the topic subscription, due to library limitations.
     * Sets the retry interval, checking each second to see
     * if the processing of each message can be retried.
     *
     * @param {*} topic Topic to consume messages from.
     * @param {*} options Object that includes the callback for
     * the message processing, callbacks for other events and
     * configuration variables.
     */
    async consume(topic, { callback, ...options }) {
        // if the consumer is already running, stops it to
        // subscribe to another topic
        if (this.running) await this.consumer.stop();

        await this.consumer.subscribe({ topic: topic });
        this.topicCallbacks[topic] = callback;

        // retries processing previously failed messages every second
        setInterval(() => this._retry(options), 1000);

        this.running = true;

        // run the consumer only if the flag is true, making it
        // possible to subscribe to several topics first and
        // then execute the consumer
        if (options.run) this._runConsumer(options);
    }

    /**
     * Calls the given callback for the topic and sends a
     * message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided. If the processing fails, adds the message
     * to a retry buffer, to be retried later.
     *
     * @param {*} message Message consumed by the consumer.
     * @param {*} topic Topic where the message was consumed.
     * @param {*} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        const retries = options.retries === undefined ? this.retries : options.retries;
        const retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;

        const parsedMessage = JSON.parse(message.value.toString());
        try {
            await this.topicCallbacks[topic](parsedMessage);
        } catch (err) {
            // if the message processing fails, the message is
            // added to a retry buffer that will retry in an
            // exponentially increasing delay
            this.retryBuffer.push({
                ...parsedMessage,
                firstFailure: Date.now(),
                lastRetry: Date.now(),
                topic: topic,
                retries: retries,
                retryDelay: retryDelay
            });
            await this._updateBufferFile();
            return;
        }

        if (!options.autoConfirm) return;
        if (options.onSuccess) options.onSuccess(parsedMessage);
        else if (options.autoConfirm) this._onSuccess(parsedMessage);
    }

    /**
     * Retries the processing of the messages in the retry buffer.
     * If the message expires its retries, an event is sent announcing
     * the failure. This `onError` logic can be outsourced if a function
     * was provided.
     *
     * @param {*} options Object that contains configuration
     * variables and callback methods.
     */
    async _retry(options = {}) {
        if (this.retryBuffer.length === 0) return;

        for (let i = 0; i < this.retryBuffer.length; i++) {
            const message = this.retryBuffer[i];

            // if there are no retries left or the maximum time
            // for retries has passed, send the failed event to
            // a topic and remove the message from the retry buffer
            const messageFailureMaxTime =
                options.messageFailureMaxTime === undefined
                    ? this.messageFailureMaxTime
                    : options.messageFailureMaxTime;
            if (
                message.retries === 0 ||
                (messageFailureMaxTime &&
                    Date.now() - message.firstFailure >= messageFailureMaxTime)
            ) {
                this.retryBuffer.splice(i, 1);
                await this._updateBufferFile();
                i--;

                if (!options.autoConfirm) continue;
                if (options.onError) options.onError(message);
                else this._onError(message);
                continue;
            }

            // if the retry delay has passed, try processing the message
            // again, if it is successful removes the message from the
            // buffer, if not increases the delay time exponentially
            if (message.lastRetry + message.retryDelay <= Date.now()) {
                try {
                    await this.topicCallbacks[message.topic](message);
                } catch (err) {
                    // increases the delay time exponentially while
                    // decreasing the number of retries available
                    const messageDelayExponential =
                        options.messageDelayExponential === undefined
                            ? this.messageDelayExponential
                            : options.messageDelayExponential;
                    const updatedMessage = {
                        ...message,
                        lastRetry: Date.now(),
                        retries: message.retries - 1,
                        retryDelay: message.retryDelay * messageDelayExponential
                    };
                    this.retryBuffer[i] = updatedMessage;
                    await this._updateBufferFile();
                    continue;
                }

                this.retryBuffer.splice(i, 1);
                await this._updateBufferFile();
                i--;

                if (!options.autoConfirm) continue;
                if (options.onSuccess) options.onSuccess(message);
                else this._onSuccess(message);
            }
        }
    }

    /**
     * Function called when a message fails to be processed.
     *
     * @param {*} message Message consumed by the consumer.
     */
    _onError(message) {
        const failure = {
            name: "error",
            hostname: os.hostname(),
            datatype: "json",
            timestamp: new Date(),
            payload: message
        };
        new API().trigger("error", failure);
    }

    /**
     * Reads the file with the persisted retry buffer and
     * populates the buffer.
     */
    async _readFromBufferFile() {
        const dir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");
        try {
            await fs.promises.access(dir, fs.constants.R_OK | fs.constants.W_OK);
        } catch (err) {
            await fs.promises.mkdir(dir);
            return;
        }

        if (!fs.existsSync(`${dir}/retry.json`)) return;
        const data = await fs.promises.readFile(`${dir}/retry.json`, { encoding: "utf-8" });
        this.retryBuffer = JSON.parse(data);
    }

    /**
     * Updates the persisted retry file with the current
     * retry buffer.
     */
    async _updateBufferFile() {
        const dir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");
        await fs.promises.writeFile(`${dir}/retry.json`, JSON.stringify(this.retryBuffer), "utf-8");
    }
}

export default KafkaConsumer;
