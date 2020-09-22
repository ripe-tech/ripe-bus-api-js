import * as os from "os";
import * as fs from "fs";
import { conf } from "yonius";
import { Consumer } from "./consumer";
import { KafkaClient } from "./kafkaClient";
import { API } from "./base";

export class KafkaConsumer extends Consumer {
    constructor(options = {}) {
        super();
        this._build(options);

        const kafkaClient = KafkaClient.getInstance();
        this.consumer = kafkaClient.consumer({
            groupId: this.groupId,
            minBytes: this.minBytes,
            maxBytes: this.maxBytes,
            maxWaitTimeInMs: this.maxWaitTimeInMs
        });
        this.topicCallbacks = {};
        this.retryBuffer = [];
        this.running = false;

        this._readFromBufferFile();
    }

    async _build(options) {
        this.groupId = conf("KAFKA_CONSUMER_GROUP_ID", "ripe-kafka-consumer");
        this.minBytes = conf("KAFKA_CONSUMER_FETCH_MIN_BYTES", 1);
        this.maxBytes = conf("KAFKA_CONSUMER_FETCH_MAX_BYTES", 1024 * 1024);
        this.maxWaitTimeInMs = conf("KAFKA_CONSUMER_FETCH_MAX_WAIT", 100);
        this.autoCommit = conf("KAFKA_CONSUMER_AUTO_COMMIT", true);
        this.autoCommitInterval = conf("KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL", 5000);
        this.autoCommitThreshold = conf("KAFKA_CONSUMER_AUTO_COMMIT_THRESHOLD", 1);
        this.partitionsConsumedConcurrently = conf(
            "KAFKA_CONSUMER_PARTITIONS_CONSUMED_CONCURRENTLY",
            1
        );
        this.eachBatchAutoResolve = conf("KAFKA_CONSUMER_BATCH_AUTO_RESOLVE", true);
        this.retries = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES", 5);
        this.retryDelay = conf("KAFKA_CONSUMER_MESSAGE_FIRST_DELAY", 50);
        this.messageFailureMaxTime = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null);
        this.messageDelayExponential = conf("KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL", 2);

        this.groupId = options.groupId ? this.groupId : options.groupId;
        this.minBytes = options.minBytes ? this.minBytes : options.minBytes;
        this.maxBytes = options.maxBytes ? this.maxBytes : options.maxBytes;
        this.maxWaitTimeInMs = options.maxWaitTimeInMs
            ? this.maxWaitTimeInMs
            : options.maxWaitTimeInMs;
        this.autoCommit = options.autoCommit ? this.autoCommit : options.autoCommit;
        this.autoCommitInterval = options.autoCommitInterval
            ? this.autoCommitInterval
            : options.autoCommitInterval;
        this.autoCommitThreshold = options.autoCommitThreshold
            ? this.autoCommitThreshold
            : options.autoCommitThreshold;
        this.partitionsConsumedConcurrently = options.partitionsConsumedConcurrently
            ? this.partitionsConsumedConcurrently
            : options.partitionsConsumedConcurrently;
        this.eachBatchAutoResolve = options.eachBatchAutoResolve
            ? this.eachBatchAutoResolve
            : options.eachBatchAutoResolve;
        this.retries = options.retries ? this.retries : options.retries;
        this.retryDelay = options.retryDelay ? this.retryDelay : options.retryDelay;
        this.messageFailureMaxTime = options.messageFailureMaxTime
            ? this.messageFailureMaxTime
            : options.messageFailureMaxTime;
        this.messageDelayExponential = options.messageDelayExponential
            ? this.messageDelayExponential
            : options.messageDelayExponential;
    }

    async connect() {
        await this.consumer.connect();
    }

    async disconnect() {
        await this.consumer.disconnect();
        this.running = false;
    }

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

    async _runConsumer(options = {}) {
        const autoCommit = options.autoCommit === undefined ? this.autoCommit : options.autoCommit;
        const autoCommitInterval =
            options.autoCommitInterval === undefined
                ? this.autoCommitInterval
                : options.autoCommitInterval;
        const autoCommitThreshold =
            options.autoCommitThreshold === undefined
                ? this.autoCommitThreshold
                : options.autoCommitThreshold;
        const partitionsConsumedConcurrently =
            options.partitionsConsumedConcurrently === undefined
                ? this.partitionsConsumedConcurrently
                : options.partitionsConsumedConcurrently;
        const eachBatchAutoResolve =
            options.eachBatchAutoResolve === undefined
                ? this.eachBatchAutoResolve
                : options.eachBatchAutoResolve;
        const retries = options.retries === undefined ? this.retries : options.retries;
        const retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;

        this.consumer.run({
            autoCommit: autoCommit,
            autoCommitInterval: autoCommitInterval,
            autoCommitThreshold: autoCommitThreshold,
            partitionsConsumedConcurrently: partitionsConsumedConcurrently,
            eachBatchAutoResolve: eachBatchAutoResolve,
            eachBatch: async ({ batch, heartbeat, isRunning, isStale }) => {
                for (const message of batch.messages) {
                    // does not process message if message is marked
                    // as stale or if the consumer is not running
                    if (!isRunning() || isStale()) break;

                    const parsedMessage = JSON.parse(message.value.toString());
                    try {
                        await this.topicCallbacks[batch.topic](parsedMessage);
                    } catch (err) {
                        // if the message processing fails, the message is
                        // added to a retry buffer that will retry in an
                        // exponentially increasing delay
                        this.retryBuffer.push({
                            ...parsedMessage,
                            firstFailure: Date.now(),
                            lastRetry: Date.now(),
                            topic: batch.topic,
                            retries: retries,
                            retryDelay: retryDelay
                        });
                        this._updateBufferFile();
                        return;
                    }

                    await heartbeat();

                    if (!options.autoConfirm) continue;
                    if (options.onSuccess) options.onSuccess(parsedMessage);
                    else this._onSuccess(message);
                }
            }
        });
    }

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
                this._updateBufferFile();
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
                    this._updateBufferFile();
                    continue;
                }

                this.retryBuffer.splice(i, 1);
                this._updateBufferFile();
                i--;

                if (!options.autoConfirm) continue;
                if (options.onSuccess) options.onSuccess(message);
                else this._onSuccess(message);
            }
        }
    }

    _onSuccess(message) {
        const confirmation = {
            name: "success",
            hostname: os.hostname(),
            datatype: "json",
            timestamp: new Date(),
            payload: message
        };
        new API().trigger("confirmation", confirmation);
    }

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

    _readFromBufferFile() {
        const dir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            return;
        }

        if (!fs.existsSync(`${dir}/retry.json`)) return;
        const data = fs.readFileSync(`${dir}/retry.json`, { encoding: "utf-8" });
        this.retryBuffer = JSON.parse(data);
    }

    _updateBufferFile() {
        const dir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");
        fs.writeFileSync(`${dir}/retry.json`, JSON.stringify(this.retryBuffer), "utf-8");
    }
}

export default KafkaConsumer;
