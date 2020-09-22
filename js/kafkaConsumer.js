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
        if (typeof topic === "string") topic = { topic: topic };

        await this.consumer.subscribe(topic);

        // if the consumer is already running, only subscribes to the topic
        if (this.running) return;

        // retries processing previously failed messages every second
        setInterval(() => this._retry(callback, options), 1000);
        this.running = true;

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
                        await callback(parsedMessage);
                    } catch (err) {
                        // if the message processing fails, the message is
                        // added to a retry buffer that will retry in an
                        // exponentially increasing delay
                        this.retryBuffer.push({
                            ...parsedMessage,
                            firstFailure: Date.now(),
                            lastRetry: Date.now(),
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
                    await callback(message);
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
            name: "success",
            hostname: os.hostname(),
            datatype: "json",
            timestamp: new Date(),
            payload: message
        };
        new API().trigger("error", failure);
    }

    _readFromBufferFile() {
        if (!fs.existsSync("data")) {
            fs.mkdirSync("data");
            return;
        }

        if (!fs.existsSync("data/retry.json")) return;
        const data = fs.readFileSync("data/retry.json", { encoding: "utf-8" });
        this.retryBuffer = JSON.parse(data);
    }

    _updateBufferFile() {
        fs.writeFileSync("data/retry.json", JSON.stringify(this.retryBuffer), "utf-8");
    }
}

export default KafkaConsumer;
