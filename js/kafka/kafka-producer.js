import { conf } from "yonius";
import { KafkaClient } from "./kafka-client";
import { Producer } from "../producer";

export class KafkaProducer extends Producer {
    constructor(owner, options = {}) {
        super(owner, options);

        this.metadataMaxAge = conf("KAFKA_PRODUCER_METADATA_MAX_AGE", 300000);
        this.allowAutoTopicCreation = conf("KAFKA_PRODUCER_AUTO_TOPIC_CREATION", true);
        this.transactionTimeout = conf("KAFKA_PRODUCER_TRANSITION_TIMEOUT", 60000);
        this.acks = conf("KAFKA_PRODUCER_ACKS", 0);
        this.timeout = conf("KAFKA_PRODUCER_TIMEOUT", 30000);
        this.compression = conf("KAFKA_PRODUCER_COMPRESSION", null);

        this.metadataMaxAge =
            options.producerMetadataMaxAge === undefined
                ? this.metadataMaxAge
                : options.producerMetadataMaxAge;
        this.allowAutoTopicCreation =
            options.producerAutoTopicCreation === undefined
                ? this.allowAutoTopicCreation
                : options.producerAutoTopicCreation;
        this.transactionTimeout =
            options.producerTransitionTimeout === undefined
                ? this.transactionTimeout
                : options.producerTransitionTimeout;
        this.acks = options.producerAcks === undefined ? this.acks : options.producerAcks;
        this.timeout =
            options.producerTimeout === undefined ? this.timeout : options.producerTimeout;
        this.compression =
            options.producerCompression === undefined
                ? this.compression
                : options.producerCompression;

        const kafkaClient = KafkaClient.getInstance(options);
        this.producer = kafkaClient.producer({
            metadataMaxAge: this.metadataMaxAge,
            allowAutoTopicCreation: this.allowAutoTopicCreation,
            transactionTimeout: this.transactionTimeout
        });
    }

    async connect() {
        await this.producer.connect();
    }

    async disconnect() {
        await this.producer.disconnect();
    }

    /**
     * Converts messages to an array of strings and sends
     * it to a specified topic.
     *
     * @param {String} topic Topic to send messages to.
     * @param {Array|Object|String} message Message or messages
     * to be sent to a topic.
     * @param {Object} options Object that includes configuration
     * variables.
     */
    async produce(topic, message, options = {}) {
        const convertedMessages = this._convertMessages(message);

        await this.producer.send({
            topic: topic,
            acks: options.producerAcks ? this.acks : options.producerAcks,
            timeout: options.producerTimeout ? this.timeout : options.producerTimeout,
            compression: KafkaClient.convertCompressionTypes(
                options.producerCompression ? this.compression : options.producerCompression
            ),
            messages: convertedMessages
        });
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