import { conf } from "yonius";
import * as fs from "fs";

console.log(fs);

export class Consumer {
    constructor(kafkaClient) {
        this.consumer = kafkaClient.consumer({
            groupId: conf("KAFKA_CONSUMER_GROUP_ID", "kafka-consumer"),
            minBytes: conf("KAFKA_CONSUMER_FETCH_MIN_BYTES", 1),
            maxBytes: conf("KAFKA_CONSUMER_FETCH_MAX_BYTES", 1024 * 1024),
            maxWaitTimeInMs: conf("KAFKA_CONSUMER_FETCH_MAX_WAIT", 100)
        });
        this.retryBuffer = [];

        this._readFromBufferFile();
    }

    async connect() {
        await this.consumer.connect();
    }

    async disconnect() {
        await this.consumer.disconnect();
    }

    async run(messageProcessor, sendConfirmation = null, sendError = null) {
        for (const topic of this._getConsumerTopics()) await this.consumer.subscribe(topic);

        // retries processing previously failed
        // messages every second
        setInterval(() => this._retry(messageProcessor, sendConfirmation, sendError), 1000);

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
                    const result = await messageProcessor(parsedMessage);

                    // if the message processing fails, the message is
                    // added to a retry buffer that will retry in an
                    // exponentially increasing delay
                    if (result && result.err) {
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

                    if (sendConfirmation) await sendConfirmation(parsedMessage);
                }
            }
        });
    }

    async _retry(messageProcessor, sendConfirmation = null, sendError = null) {
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
                if (sendError) await sendError(message);
                this.retryBuffer.splice(i, 1);
                i--;
                continue;
            }

            // if the retry delay has passed, try processing the message
            // again, if it is successful removes the message from the
            // buffer, if not increases the delay time exponentially
            if (message.lastRetry + message.retryDelay <= Date.now()) {
                const result = await messageProcessor(message);

                if (result && result.err) {
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
                // send confirmation to a topic that the
                // message as been processed, even if the
                // processing failed
                if (sendConfirmation) await sendConfirmation(message);
                this.retryBuffer.splice(i, 1);
                this._updateBufferFile();
                i--;
            }
        }
    }

    _getConsumerTopics() {
        return conf("KAFKA_CONSUMER_TOPICS", "")
            .split(" ")
            .map(topic => ({
                topic: topic
            }));
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

export default Consumer;
