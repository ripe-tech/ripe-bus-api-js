import * as os from "os";
import { conf, load, YoniusError } from "yonius";
import { KafkaProducer, KafkaConsumer, KafkaRetryConsumer, KafkaRetryProducer } from "./kafka";

const adapters = {
    KafkaProducer,
    KafkaConsumer,
    KafkaRetryProducer,
    KafkaRetryConsumer
};

export class API {
    constructor(options = {}) {
        this.consumer = null;
        this.producer = null;
        this.options = options;

        this.busAdapter = conf("BUS_ADAPTER", "kafka");
        this.busAdapter =
            this.options.adapter === undefined ? this.busAdapter : this.options.adapter;
    }

    static async load() {
        await load();
    }

    /**
     * Builds a producer if it doesn't already have one and sends
     * the message according to the provided name.
     *
     * @param {String} name Event name in a canonical form should be
     * represented by domain separated by the `.` character.
     * @param {Array|Object|String} payload Message payload to be sent,
     * should be serializable.
     * @param {Object} options Object that includes configuration
     * variables, including the name of the topic where the event is
     * going to be sent to.
     */
    async trigger(name, payload, options = {}) {
        await this._ensureProducer(options);

        const event = {
            name: name,
            origin: options.origin || null,
            hostname: options.hostname || os.hostname(),
            datatype: options.datatype || "json",
            timestamp: options.timestamp || Date.now(),
            payload: payload
        };

        const topic = options.topic || name.split(".", 1)[0];

        await this.producer.produce(topic, event, options);

        const globalDiffusion =
            options.globalDiffusion === undefined
                ? this.producer.globalDiffusion
                : options.globalDiffusion;
        const globalTopic = this._globalTopic(topic);
        if (globalDiffusion && globalTopic) await this.trigger(globalTopic, payload, options);
    }

    /**
     * Builds a consumer if it doesn't already have one and starts
     * consuming messages from the given topic, binding the
     * callback to any new messages from the topic. The options
     * can be a function, that corresponds to the callback, or
     * an object that contains the callback and other functions
     * and variables.
     *
     * @param {String} topic Topic to consume messages from.
     * @param {Function|Object} options Object that includes the
     * callback for the message processing, callbacks for other
     * events and configuration variables.
     */
    async bind(topic, options = {}) {
        let callback = null;

        if (typeof options === "function") {
            callback = options;
            options = {
                autoConfirm: true,
                run: true,
                block: false,
                ...this.options
            };
        } else if (typeof options === "object") {
            options = {
                autoConfirm: true,
                run: true,
                block: false,
                ...this.options,
                ...options
            };
        } else {
            throw new YoniusError("Invalid options type");
        }

        // updates the on success event handler defaulting to a standard
        // auto confirm implementation in case no on success is defined
        const onSuccessDefault = (message, topic) =>
            options.autoConfirm && this.trigger("confirmation.success", message);
        options.onSuccess = options.onSuccess === undefined ? onSuccessDefault : options.onSuccess;

        // makes sure that there's a valid consumer instance that is
        // connected to the proper remote provider
        await this._ensureConsumer(options);

        // start the consuming process for the requested topic
        // this may block the current execution into an event loop
        await this.consumer.consume(topic, { callback: callback, ...options });
    }

    async topics() {
        const producer = await this._getProducer();
        const topics = await producer.topics();
        return topics;
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }

    get adapter() {
        return this.busAdapter[0].toUpperCase() + this.busAdapter.slice(1);
    }

    async _getProducer(options = {}) {
        await this._ensureProducer(options);
        return this.producer;
    }

    async _getConsumer(options = {}) {
        await this._ensureConsumer(options);
        return this.consumer;
    }

    async _ensureProducer(options = {}) {
        if (this.producer) return;
        await this._buildProducer(options);
    }

    async _ensureConsumer(options = {}) {
        if (this.consumer) return;
        await this._buildConsumer(options);
    }

    async _buildProducer(options = {}) {
        this.producer = await adapters[this.adapter + "Producer"].build(this, options);
        await this.producer.connect();
    }

    async _buildConsumer(options = {}) {
        this.consumer = await adapters[this.adapter + "Consumer"].build(this, options);
        await this.consumer.connect();
    }

    /**
     * Parses a topic name to extract the global topic.
     * For example, the global topic of "global:subdomain-123"
     * is "global".
     *
     * @param {String} topic The name of the topic to be parsed.
     * @returns {String} The global topic name.
     */
    _globalTopic(topic, separator = ":") {
        if (!topic.includes(separator)) return;
        return topic.substring(0, topic.lastIndexOf(separator));
    }
}

export default API;
