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

    get adapter() {
        const busConf = conf("BUS", "kafka");
        return busConf[0].toUpperCase() + busConf.slice(1);
    }

    async _buildProducer() {
        this.producer = new adapters[this.adapter + "Producer"]();
        await this.producer.connect();
    }

    async _buildConsumer() {
        this.consumer = new adapters[this.adapter + "Consumer"]();
        await this.consumer.connect();
    }

    async trigger(topic, message, options = {}) {
        if (!this.producer) await this._buildProducer();
        options = { autoConfirm: true, ...options };
        await this.producer.produce(topic, [message], options);
    }

    async bind(topic, callback, options = {}) {
        if (!this.consumer) await this._buildConsumer();
        options = { autoConfirm: true, ...options };
        await this.consumer.consume(topic, callback, options);
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }
}

export default API;
