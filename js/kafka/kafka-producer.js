import { conf } from "yonius";

import { KafkaClient } from "./kafka-client";
import { Producer } from "../producer";

export class KafkaProducer extends Producer {
    static async build(owner, options = {}) {
        const instance = new this(owner, options);
        await instance.init(options);
        return instance;
    }

    async init(owner, options = {}) {
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

        const kafkaClient = await KafkaClient.getInstance(options);
        this.producer = kafkaClient.client.producer({
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
        await this.producer.send({
            topic: KafkaClient.sanitizeTopic(topic),
            acks: options.producerAcks ? this.acks : options.producerAcks,
            timeout: options.producerTimeout ? this.timeout : options.producerTimeout,
            compression: KafkaClient.convertCompression(
                options.producerCompression ? this.compression : options.producerCompression
            ),
            messages: this._serializeMessage(message)
        });
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

    _serializeMessage(messages) {
        return (Array.isArray(messages) ? messages : [messages]).map(message => ({
            value: JSON.stringify(message)
        }));
    }
}

export default KafkaProducer;
