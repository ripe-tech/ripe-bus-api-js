import * as fs from "fs";
import { conf } from "yonius";

import { KafkaClient } from "./kafka-client";
import { KafkaConsumer } from "./kafka-consumer";

export class KafkaRetryConsumer extends KafkaConsumer {
    async init(options = {}) {
        await super.init(options);

        this.retries = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES", 5);
        this.retryDelay = conf("KAFKA_CONSUMER_MESSAGE_FIRST_DELAY", 50);
        this.messageFailureMaxTime = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null);
        this.messageDelayExponential = conf("KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL", 2);
        this.retryPersistenceDir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");

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
        this.retryPersistenceDir =
            options.retryPersistenceDir === undefined
                ? this.retryPersistenceDir
                : options.retryPersistenceDir;

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
     * @param {Array|String} topics Topics to consume messages from.
     * @param {Object} options Object that includes the callback for
     * the message processing, callbacks for other events and
     * configuration variables.
     */
    async consume(topics, options = {}) {
        // coerces a possible string value into an array so that
        // the remaining logic becomes consistent
        topics = Array.isArray(topics) ? topics : [topics];

        // sanitizes topic names according to Kafka
        // topic naming rules
        topics = topics.map(topic => KafkaClient.sanitizeTopic(topic));

        // if the consumer is already running, stops it to
        // subscribe to another topic
        if (this.running) await this.consumer.stop();

        // subscribes to the complete set of requested topics (async fashion)
        // and wait for the respective promises in parallel
        await Promise.all(
            topics.map(async topic => await this.consumer.subscribe({ topic: topic }))
        );
        topics.forEach(topic => (this.topicCallbacks[topic] = options.callback));

        // retries processing previously failed messages every second
        setInterval(() => this._retry(options), 1000);

        // run the consumer only if the flag is true, making it
        // possible to subscribe to several topics first and
        // then execute the consumer
        if (options.run) await this._runConsumer(options);

        // if the event loop should be blocked under the async
        // execution, then runs an infinite await operation over
        // a promise that is never resolved
        if (options.block) await new Promise(() => true);
    }

    /**
     * Calls the given callback for the topic and sends a
     * message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided. If the processing fails, adds the message
     * to a retry buffer, to be retried later.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        const retries = options.retries === undefined ? this.retries : options.retries;
        const retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;

        try {
            await this.topicCallbacks[topic](message, topic);
        } catch (err) {
            // if the message processing fails, the message is
            // added to a retry buffer that will retry in an
            // exponentially increasing delay
            this.retryBuffer.push({
                ...message,
                firstFailure: Date.now(),
                lastRetry: Date.now(),
                topic: topic,
                retries: retries,
                retryDelay: retryDelay
            });
            await this._updateBufferFile();
            return;
        }

        if (options.onSuccess) options.onSuccess(message, topic);
    }

    /**
     * Retries the processing of the messages in the retry buffer.
     * If the message expires its retries, an event is sent announcing
     * the failure. This `onError` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _retry(options = {}) {
        // iterates over the complete set of messages to be processed
        // under the retry promise
        for (let i = 0; i < this.retryBuffer.length; i++) {
            // gather the message to be processed in the current loop
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
                else this.owner.trigger("error", message);
                continue;
            }

            // in case the time for processing of the message has not been
            // reached then continue the loop trying to find valid messages
            if (Date.now() < message.lastRetry + message.retryDelay) continue;

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

            if (options.onSuccess) options.onSuccess(message, message.topic);
        }
    }

    /**
     * Reads the file with the persisted retry buffer and
     * populates the buffer.
     */
    async _readFromBufferFile() {
        try {
            await fs.promises.access(
                this.retryPersistenceDir,
                fs.constants.R_OK | fs.constants.W_OK
            );
        } catch (err) {
            await fs.promises.mkdir(this.retryPersistenceDir);
            return;
        }

        // if the file exists, reads it and populates
        // the retryBuffer, if not ignores and returns
        const data = await fs.promises.readFile(`${this.retryPersistenceDir}/retry.json`, {
            encoding: "utf-8"
        });
        this.retryBuffer = JSON.parse(data);
    }

    /**
     * Updates the persisted retry file with the current
     * retry buffer.
     */
    async _updateBufferFile() {
        await fs.promises.writeFile(
            `${this.retryPersistenceDir}/retry.json`,
            JSON.stringify(this.retryBuffer),
            "utf-8"
        );
    }
}

export default KafkaConsumer;
