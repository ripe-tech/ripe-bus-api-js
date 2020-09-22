import * as os from "os";
import * as fs from "fs";
import { conf } from "yonius";
import { Consumer } from "./consumer";
import { KafkaClient } from "./kafkaClient";
import { API } from "./base";

export class KafkaConsumer extends Consumer {
    constructor() {
        super();

        const kafkaClient = KafkaClient.getInstance();
        this.consumer = kafkaClient.consumer({
            groupId: conf("KAFKA_CONSUMER_GROUP_ID", "ripe-kafka-consumer"),
            minBytes: conf("KAFKA_CONSUMER_FETCH_MIN_BYTES", 1),
            maxBytes: conf("KAFKA_CONSUMER_FETCH_MAX_BYTES", 1024 * 1024),
            maxWaitTimeInMs: conf("KAFKA_CONSUMER_FETCH_MAX_WAIT", 100)
        });
        this.topicCallbacks = {};
        this.retryBuffer = [];
        this.running = false;

        this._readFromBufferFile();
    }

    async connect() {
        await this.consumer.connect();
    }

    async disconnect() {
        await this.consumer.disconnect();
        this.running = false;
    }

    async consume(topic, callback, options = {}) {
        // if the consumer is already running, stops it to
        // subscribe to another topic
        if (this.running) await this.consumer.stop();

        await this.consumer.subscribe({ topic: topic });
        this.topicCallbacks[topic] = callback;

        // retries processing previously failed messages every second
        setInterval(() => this._retry(callback, options), 1000);

        this.running = true;
        this._runConsumer(options);
    }

    async _runConsumer(options = {}) {
        this.consumer.run({
            autoCommit: conf("KAFKA_CONSUMER_AUTO_COMMIT", true),
            autoCommitInterval: conf("KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL", 5000),
            autoCommitThreshold: conf("KAFKA_CONSUMER_AUTO_COMMIT_THRESHOLD", 1),
            partitionsConsumedConcurrently: conf(
                "KAFKA_CONSUMER_PARTITIONS_CONSUMED_CONCURRENTLY",
                1
            ),
            eachBatchAutoResolve: conf("KAFKA_CONSUMER_BATCH_AUTO_RESOLVE", true),
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
                            retries: conf("KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES", 5),
                            retryDelay: conf("KAFKA_CONSUMER_MESSAGE_FIRST_DELAY", 50)
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

    async _retry(callback, options = {}) {
        if (this.retryBuffer.length === 0) return;

        for (let i = 0; i < this.retryBuffer.length; i++) {
            const message = this.retryBuffer[i];

            // if there are no retries left or the maximum time
            // for retries has passed, send the failed event to
            // a topic and remove the message from the retry buffer
            if (
                message.retries === 0 ||
                (conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null) &&
                    Date.now() - message.firstFailure >=
                        conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null))
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
                    const updatedMessage = {
                        ...message,
                        lastRetry: Date.now(),
                        retries: message.retries - 1,
                        retryDelay:
                            message.retryDelay * conf("KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL", 2)
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
