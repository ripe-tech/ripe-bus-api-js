import { conf, load } from "yonius";
import { KafkaProducer } from "./kafkaProducer";
import { KafkaConsumer } from "./kafkaConsumer";

const adapters = {
    KafkaProducer,
    KafkaConsumer
};

export class API {
    constructor() {
        this.consumer = null;
        this.producer = null;
    }

    static async load() {
        await load();
    }

    async trigger(topic, options = {}) {
        if (!this.producer) await this._buildProducer(options);
        await this.producer.produce(topic, options);
    }

    async bind(topic, options = {}) {
        let callback = null;

        if (typeof options === "function") callback = options;
        else if (typeof options === "object") {
            options = { autoConfirm: true, run: true, ...options };
        }

        if (!this.consumer) await this._buildConsumer(options);
        await this.consumer.consume(topic, { callback, ...options });
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }

    get adapter() {
        const busConf = conf("BUS", "kafka");
        return busConf[0].toUpperCase() + busConf.slice(1);
    }

    async _buildProducer(args) {
        this.producer = new adapters[this.adapter + "Producer"]();
        await this.producer.connect();
    }

    async _buildConsumer() {
        this.consumer = new adapters[this.adapter + "Consumer"]();
        await this.consumer.connect();
    }
}

export default API;
