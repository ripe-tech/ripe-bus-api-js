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

        // normalizes the events value as a sequence making sure that if a basic
        // type is provided it's encapsulated as an array
        const events =
            options.events === undefined
                ? null
                : Array.isArray(options.events)
                ? options.events
                : [options.events];

        // saves the callbacks for each topic and event and overrides them with
        // with the current callback if the option is defined
        topics.forEach(topic => {
            const callbacks = options.override ? {} : this.topicCallbacks[topic] || {};
            if (events) {
                events.forEach(event => (callbacks[event] = options.callback));
            } else {
                callbacks["*"] = options.callback;
            }
            this.topicCallbacks[topic] = callbacks;
        });

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
                        const messageD = this._deserializeMessage(message);

                        // processes the message, notifying any listener about
                        // its reception, the processing of the message is done
                        // for the provided topic and taking into consideration
                        // the provided set of options
                        await this._processMessage(messageD, batch.topic, options);
                    } catch (err) {
                        console.trace(
                            `Problem handling message (offset=${message.offset}, timestamp=${message.timestamp}) in topic '${batch.topic}': ${err}`
                        );
                    } finally {
                        await heartbeat();
                    }
                }
            }
        });
    }

    /**
     * Calls the given callbacks for the topic and event and sends
     * a message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        // retrieves all the callbacks for the provided: message, topic
        // and event to be able to call them latter
        const callbackPromises = Object.entries(this.topicCallbacks[topic])
                .filter(([event, callback]) => event === message.name || event === "*")
            .map(([event, callback]) => callback(message, topic));

        // returns the control flow immediately in case there
        // are no callbacks to be called, this ensures that the
        // message is not marked as "consumed" as there are no
        // valid callbacks called for it
        if (callbackPromises.length === 0) return;

        // waits for all the callback promises to be fulfilled
        // (keep in mind that execution is done in parallel)
        await Promise.all(callbackPromises);

        // in case an on success callback is defined in the options
        // object then such callback is called
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
