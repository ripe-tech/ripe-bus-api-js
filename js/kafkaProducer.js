import { conf } from "yonius";
import { CompressionTypes } from "kafkajs";
import { Producer } from "./producer";
import { KafkaClient } from "./kafkaClient";

export class KafkaProducer extends Producer {
    constructor(options = {}) {
        super();

        const kafkaClient = KafkaClient.getInstance();
        this.producer = kafkaClient.producer({
            metadataMaxAge:
                options.producerMetadataMaxAge === undefined
                    ? conf("KAFKA_PRODUCER_METADATA_MAX_AGE", 300000)
                    : options.producerMetadataMaxAge,
            allowAutoTopicCreation:
                options.producerAutoTopicCreation === undefined
                    ? conf("KAFKA_PRODUCER_AUTO_TOPIC_CREATION", true)
                    : options.producerAutoTopicCreation,
            transactionTimeout:
                options.producerTransitionTimeout === undefined
                    ? conf("KAFKA_PRODUCER_TRANSITION_TIMEOUT", 60000)
                    : options.producerTransitionTimeout
        });

        this.acks =
            options.producerAcks === undefined
                ? conf("KAFKA_PRODUCER_ACKS", 0)
                : options.producerAcks;
        this.timeout =
            options.producerTimeout === undefined
                ? conf("KAFKA_PRODUCER_TIMEOUT", 30000)
                : options.producerTimeout;
        this.compression =
            options.producerCompression === undefined
                ? conf("KAFKA_PRODUCER_COMPRESSION", null)
                : options.producerCompression;
    }

    async connect() {
        await this.producer.connect();
    }

    async disconnect() {
        await this.producer.disconnect();
    }

    async produce(topic, message, options = {}) {
        const convertedMessages = this._convertMessages(message);

        await this.producer.send({
            topic: topic,
            acks: options.producerAcks ? this.acks : options.producerAcks,
            timeout: options.producerTimeout ? this.timeout : options.producerTimeout,
            compression: this._convertCompressionTypes(
                options.producerCompression ? this.compression : options.producerCompression
            ),
            messages: convertedMessages
        });
    }

    _convertCompressionTypes(compression) {
        if (compression === "gzip") return CompressionTypes.GZIP;
        return CompressionTypes.None;
    }

    _convertMessages(messages) {
        const convertedMessages = [];
        if (!(messages instanceof Array)) messages = [messages];
        for (const message of messages) {
            if (typeof message === "string") convertedMessages.push(message);
            else convertedMessages.push({ value: JSON.stringify(message) });
        }
        return convertedMessages;
    }
}

export default KafkaProducer;
