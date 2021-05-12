import { v4 } from "uuid";
import { conf } from "yonius";

import { KafkaClient } from "./kafka-client";
import { Consumer } from "../consumer";

export class KafkaConsumer extends Consumer {
    static async build(owner, options = {}) {
        const instance = new this(owner, options);
        await instance.init(options);
        return instance;
    }

    async init(options = {}) {
        this.groupId = conf("KAFKA_CONSUMER_GROUP_ID", this._randomValue());
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

        const kafkaClient = await KafkaClient.getInstance();
        this.consumer = kafkaClient.client.consumer({
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
     * Subscribes the consumer to the given topics and starts
     * consuming if the `run` flag is set.
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

        // sanitizes topic names according to Kafka topic naming rules
        // avoiding illegal topic naming
        topics = topics.map(topic => KafkaClient.sanitizeTopic(topic));

        // if the consumer is already running, stops it to
        // subscribe to another topic (this is required by design)
        if (this.running) await this.consumer.stop();

        // subscribes to the complete set of requested topics (async fashion)
        // and wait for the respective promises in parallel
        await Promise.all(
            topics.map(async topic => await this.consumer.subscribe({ topic: topic }))
        );
        topics.forEach(topic => (this.topicCallbacks[topic] = options.callback));

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
     * Returns the available topics from adapter, may imply
     * a remote connection to perform it.
     *
     * @returns {Array} The list of the available topics.
     */
    async topics() {
        const kafkaClient = await KafkaClient.getInstance();
        const topics = await kafkaClient.client.admin().listTopics();
        return topics;
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
        const events =
            options.events === undefined
                ? null
                : Array.isArray(options.events)
                ? options.events
                : [options.events];

        this.running = true;
        await this.consumer.run({
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
                        // deserialize the message from its serialized structure
                        // so that it can be properly handled
                        const deserializedMessage = this._deserializeMessage(message);

                        // if this consumer is bound to specific events
                        // but this message doesn't match that, just
                        // ignores it altogether
                        if (events !== null && !options.events.includes(deserializedMessage.name)) {
                            return;
                        }

                        // processes the message, notifying any listener about
                        // its reception
                        await this._processMessage(deserializedMessage, batch.topic, options);
                    } catch (err) {
                        const result = {
                            error: err.message,
                            stack: err.stack ? err.stack.split("\n") : []
                        };
                        console.error(
                            `Problem handling message (offset=${message.offset}, timestamp=${
                                message.timestamp
                            }) in topic ${batch.topic}: ${JSON.stringify(result)}`
                        );
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
        if (options.onSuccess) options.onSuccess(message, topic);
    }

    _deserializeMessage(message) {
        return JSON.parse(message.value.toString());
    }

    _randomValue() {
        let randomValue;
        try {
            randomValue = v4();
        } catch (err) {
            const randomPart = () => Math.random().toString(36).substring(2, 15);
            randomValue = randomPart() + randomPart();
        }
        return randomValue;
    }
}

export default KafkaConsumer;
