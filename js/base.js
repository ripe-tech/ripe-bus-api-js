import { load, conf } from "yonius";
import { Kafka } from "kafkajs";
import { Consumer } from "./consumer";
import { Producer } from "./producer";

export class API {
    constructor() {
        this.kafkaClient = null;
        this.consumer = null;
        this.producer = null;
    }

    static async load() {
        await load();
    }

    async build() {
        const hosts = conf("KAFKA_HOSTS", "localhost:9092").split(" ");

        this.kafkaClient = new Kafka({
            brokers: hosts,
            clientId: conf("KAFKA_CLIENT_ID", "ripe-communications"),
            connectionTimeout: conf("KAFKA_CONNECT_TIMEOUT", 10000),
            requestTimeout: conf("KAFKA_REQUEST_TIMEOUT", 30000),
            retry: {
                initialRetryTime: conf("KAFKA_INITIAL_RETRY_TIME", 300),
                maxRetryTime: conf("KAFKA_MAX_RETRY_TIME", 30000),
                retries: conf("KAFKA_RETRIES", 5),
                maxInFlightRequests: conf("KAFKA_MAX_INFLIGHT_REQUESTS", null)
            }
        });

        this.consumer = new Consumer(this.kafkaClient);
        this.producer = new Producer(this.kafkaClient);

        await Promise.all([this.consumer.connect(), this.producer.connect()]);
    }

    async runConsumer(messageProcessor, sendConfirmation = null, sendError = null) {
        await this.consumer.run(messageProcessor, sendConfirmation, sendError);
    }

    async sendMessages(messages, topic = null) {
        await this.producer.run(messages, topic);
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }
}

export default API;
