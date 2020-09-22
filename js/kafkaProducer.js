import { conf } from "yonius";
import { CompressionTypes } from "kafkajs";
import { Producer } from "./producer";
import { KafkaClient } from "./kafkaClient";

export class KafkaProducer extends Producer {
    constructor() {
        super();

        const kafkaClient = KafkaClient.getInstance();
        this.producer = kafkaClient.producer({
            metadataMaxAge: conf("KAFKA_PRODUCER_METADATA_MAX_AGE", 300000),
            allowAutoTopicCreation: conf("KAFKA_PRODUCER_AUTO_TOPIC_CREATION", true),
            transactionTimeout: conf("KAFKA_PRODUCER_TRANSITION_TIMEOUT", 60000)
        });
    }

    async connect() {
        await this.producer.connect();
    }

    async disconnect() {
        await this.producer.disconnect();
    }

    async produce(topic, messages, options = {}) {
        const convertedMessages = this._convertMessages(messages);

        await this.producer.send({
            topic: topic,
            acks: conf("KAFKA_PRODUCER_ACKS", 0),
            timeout: conf("KAFKA_PRODUCER_TIMEOUT", 30000),
            compression: this._convertCompressionTypes(conf("KAFKA_PRODUCER_COMPRESSION", null)),
            messages: convertedMessages
        });
    }

    _convertCompressionTypes(compression) {
        if (compression === "gzip") return CompressionTypes.GZIP;
        return CompressionTypes.None;
    }

    _convertMessages(messages) {
        const convertedMessages = [];
        for (const message of messages) {
            if (typeof message === "string") convertedMessages.push(message);
            else convertedMessages.push({ value: JSON.stringify(message) });
        }
        return convertedMessages;
    }
}

export default KafkaProducer;
