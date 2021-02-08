import { hostname } from "os";
import { conf, load } from "yonius";
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
     * Builds a producer if it doesn't already have
     * one and sends the message to the given topic.
     *
     * @param {String} topic Topic to send messages to.
     * @param {Array|Object|String} message Message to be sent to a topic.
     * @param {Object} options Object that includes configuration
     * variables.
     */
    async trigger(topic, message, options = {}) {
        options = { ...this.options, ...options };
        if (!this.producer) await this._buildProducer(options);

        const event = {
            hostname: hostname(),
            datatype: "json",
            timestamp: Date.now(),
            payload: message
        };
        if (message.name) event.name = message.name;
        if (message.origin) event.origin = message.origin;

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
        }

        if (!this.consumer) await this._buildConsumer(options);
        await this.consumer.consume(topic, { callback, ...options });
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }

    get adapter() {
        return this.busAdapter[0].toUpperCase() + this.busAdapter.slice(1);
    }

    async _buildProducer() {
        this.producer = new adapters[this.adapter + "Producer"](this);
        await this.producer.connect();
    }

    async _buildConsumer() {
        this.consumer = new adapters[this.adapter + "Consumer"](this);
        await this.consumer.connect();
    }
}

export default API;
