import { conf } from "yonius";

import { KafkaClient } from "./kafka-client";
import { Producer } from "../producer";

export class KafkaProducer extends Producer {
    static async build(owner, options = {}) {
        const instance = new this(owner, options);
        await instance.init(options);
        return instance;
    }

    async init(options = {}) {
        this.metadataMaxAge = conf("KAFKA_PRODUCER_METADATA_MAX_AGE", 300000);
        this.allowAutoTopicCreation = conf("KAFKA_PRODUCER_AUTO_TOPIC_CREATION", true);
        this.transactionTimeout = conf("KAFKA_PRODUCER_TRANSACTION_TIMEOUT", 60000);
        this.acks = conf("KAFKA_PRODUCER_ACKS", 0);
        this.timeout = conf("KAFKA_PRODUCER_TIMEOUT", 30000);
        this.compression = conf("KAFKA_PRODUCER_COMPRESSION", null);
        this.maxInFlightRequests = conf("KAFKA_PRODUCER_MAX_INFLIGHT_REQUESTS", null);
        this.globalDiffusion = conf("KAFKA_GLOBAL_DIFFUSION", true);

        this.metadataMaxAge =
            options.producerMetadataMaxAge === undefined
                ? this.metadataMaxAge
                : options.producerMetadataMaxAge;
        this.allowAutoTopicCreation =
            options.producerAutoTopicCreation === undefined
                ? this.allowAutoTopicCreation
                : options.producerAutoTopicCreation;
        this.transactionTimeout =
            options.producerTransactionTimeout === undefined
                ? this.transactionTimeout
                : options.producerTransactionTimeout;
        this.acks = options.producerAcks === undefined ? this.acks : options.producerAcks;
        this.timeout =
            options.producerTimeout === undefined ? this.timeout : options.producerTimeout;
        this.compression =
            options.producerCompression === undefined
                ? this.compression
                : options.producerCompression;
        this.maxInFlightRequests =
            options.maxInFlightRequests === undefined
                ? this.maxInFlightRequests
                : options.producerMaxInFlightRequests;
        this.globalDiffusion =
            options.globalDiffusion === undefined ? this.globalDiffusion : options.globalDiffusion;

        const kafkaClient = await KafkaClient.getInstance(options);
        this.producer = kafkaClient.client.producer({
            metadataMaxAge: this.metadataMaxAge,
            allowAutoTopicCreation: this.allowAutoTopicCreation,
            transactionTimeout: this.transactionTimeout,
            maxInFlightRequests: this.maxInFlightRequests
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
     * it to a specified topic and the global topics when
     * using global diffusion.
     *
     * @param {String} topic Topic to send messages to.
     * @param {Array|Object|String} message Message or messages
     * to be sent.
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

        const globalDiffusion =
            options.globalDiffusion === undefined ? this.globalDiffusion : options.globalDiffusion;
        const globalTopic = KafkaClient.getGlobalTopic(topic);
        if (globalDiffusion && globalTopic) await this.produce(globalTopic, message, options);
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
