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
        await this._ensureProducer();

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
    }

    /**
     * Builds a consumer if it doesn't already have one
     * and starts consuming messages from the given topic,
     * binding the callback to any new messages from the
     * topic. The options can be a function, that corresponds
     * to the callback, or an object that contains the callback
     * and other functions and variables.
     *
     * @param {String} topic Topic to consume messages from.
     * @param {Function|Object} options Object that includes the callback for
     * the message processing, callbacks for other events and
     * configuration variables.
     */
    async bind(topic, options = {}) {
        let callback = null;

        if (typeof options === "function") {
            callback = options;
            options = { autoConfirm: true, run: true, ...this.options };
        } else if (typeof options === "object") {
            options = { autoConfirm: true, run: true, ...this.options, ...options };
        } else {
            throw new YoniusError("Invalid options type");
        }

        // updates the on success event handler defaulting to a standard
        // auto confirm implementation in case no on success is defined
        const onSuccessDefault = (message, topic) =>
            options.autoConfirm && this.trigger("confirmation.success", message);
        options.onSuccess = options.onSuccess === undefined ? onSuccessDefault : options.onSuccess;

        await this._ensureConsumer();

        await this.consumer.consume(topic, { callback: callback, ...options });
    }

    /**
     * Lists the available topics.
     *
     * @returns {Array} The topic names.
     */
    async listTopics() {
        const handler = this.producer || this.consumer || (await this._getProducer());
        const topics = await handler.listTopics();
        return topics;
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }

    get adapter() {
        return this.busAdapter[0].toUpperCase() + this.busAdapter.slice(1);
    }

    async _getProducer() {
        await this._ensureProducer();
        return this.producer;
    }

    async _getConsumer() {
        await this._ensureConsumer();
        return this.consumer;
    }

    async _ensureProducer() {
        if (this.producer) return;
        await this._buildProducer();
    }

    async _ensureConsumer() {
        if (this.consumer) return;
        await this._buildConsumer();
    }

    async _buildProducer() {
        this.producer = await adapters[this.adapter + "Producer"].build(this);
        await this.producer.connect();
    }

    async _buildConsumer() {
        this.consumer = await adapters[this.adapter + "Consumer"].build(this);
        await this.consumer.connect();
    }
}

export default API;
