import { conf } from "yonius";
import { KafkaClient } from "./kafka-client";
import { Consumer } from "../consumer";

export class KafkaConsumer extends Consumer {
    constructor(owner, options = {}) {
        super(owner, options);

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

        this.groupId = options.groupId === undefined ? this.groupId : options.groupId;
        this.minBytes = options.minBytes === undefined ? this.minBytes : options.minBytes;
        this.maxBytes = options.maxBytes === undefined ? this.maxBytes : options.maxBytes;
        this.maxWaitTimeInMs =
            options.maxWaitTimeInMs === undefined ? this.maxWaitTimeInMs : options.maxWaitTimeInMs;
        this.autoCommit = options.autoCommit === undefined ? this.autoCommit : options.autoCommit;
        this.autoCommitInterval =
            options.autoCommitInterval === undefined
                ? this.autoCommitInterval
                : options.autoCommitInterval;
        this.autoCommitThreshold =
            options.autoCommitThreshold === undefined
                ? this.autoCommitThreshold
                : options.autoCommitThreshold;
        this.partitionsConsumedConcurrently =
            options.partitionsConsumedConcurrently === undefined
                ? this.partitionsConsumedConcurrently
                : options.partitionsConsumedConcurrently;
        this.eachBatchAutoResolve =
            options.eachBatchAutoResolve === undefined
                ? this.eachBatchAutoResolve
                : options.eachBatchAutoResolve;

        const kafkaClient = KafkaClient.getInstance(options);
        this.consumer = kafkaClient.consumer({
            groupId: this.groupId,
            minBytes: this.minBytes,
            maxBytes: this.maxBytes,
            maxWaitTimeInMs: this.maxWaitTimeInMs
        });
        this.topicCallbacks = {};
        this.running = false;
    }

    async connect() {
        await this.consumer.connect();
    }

    async disconnect() {
        await this.consumer.disconnect();
        this.running = false;
    }

    /**
     * Subscribes the consumer to the given topic and
     * starts consuming if the `run` flag is set.
     * If the consumer was already running, it is stopped
     * before the topic subscription, due to library limitations.
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

        // if the consumer is already running, stops it to
        // subscribe to another topic
        if (this.running) await this.consumer.stop();

        await Promise.all(topics.map(topic => this.consumer.subscribe({ topic: topic })));
        topics.forEach(topic => (this.topicCallbacks[topic] = options.callback));

        // run the consumer only if the flag is true, making it
        // possible to subscribe to several topics first and
        // then execute the consumer
        if (options.run) this._runConsumer(options);
    }

    /**
     * Starts the consumer with the given configuration and
     * processes each message.
     *
     * @param {Object} options Object that contains configuration
     * variables and callback functions.
     */
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
        const name = options.name === undefined ? null : options.name;

        this.running = true;
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
                    if (!isRunning() || isStale()) return;

                    try {
                        const deserializedMessage = this._deserializeMessage(message);

                        // if this consumer is bound to a specific event
                        // name but this message doesn't match that, just
                        // ignore it altogether
                        if (name !== null && deserializedMessage.name !== name) return;
                        await this._processMessage(deserializedMessage, batch.topic, options);
                    } catch (err) {
                        console.error(`Problem handling message ${message} (${err})`);
                    } finally {
                        await heartbeat();
                    }
                }
            }
        });
    }

    /**
     * Calls the given callback for the topic and sends a
     * message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        await this.topicCallbacks[topic](message, topic);

        if (!options.autoConfirm) return;
        if (options.onSuccess) options.onSuccess(message, topic);
        else if (options.autoConfirm) this.owner.trigger("confirmation.success", message);
    }

    _deserializeMessage(message) {
        return JSON.parse(message.value.toString());
    }
}

export default KafkaConsumer;
