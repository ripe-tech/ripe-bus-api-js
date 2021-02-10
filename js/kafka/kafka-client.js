import { conf } from "yonius";
import { Kafka, CompressionTypes } from "kafkajs";

import { Client } from "../client";

export class KafkaClient extends Client {
    static async build(options = {}) {
        const instance = new this();
        await instance.init(options);
        return instance;
    }

    /**
     * Maps the string representation of a compression type to
     * a KafkaJS compatible compression type.
     *
     * @param {String} compression The compression value represented as a string.
     * @returns {Number} The KafkaJS compression type.
     */
    static convertCompression(compression) {
        switch (compression) {
            case "gzip":
                return CompressionTypes.GZIP;
            default:
                return CompressionTypes.None;
        }
    }

    /**
     * Sanitizes a topic name to match Kafka's topic naming
     * rules.
     *
     * @param {String} topic The name of the topic to be sanitized.
     * @returns {String} The sanitized topic name.
     */
    static sanitizeTopic(topic) {
        const illegalChars = /[^a-zA-Z0-9\\._\\-]/g;
        return topic.replace(illegalChars, "-");
    }

    async init(options = {}) {
        let hosts = conf("KAFKA_HOSTS", "localhost:9092");
        let clientId = conf("KAFKA_CLIENT_ID", "ripe-kafka");
        let connectionTimeout = conf("KAFKA_CONNECT_TIMEOUT", 10000);
        let requestTimeout = conf("KAFKA_REQUEST_TIMEOUT", 30000);
        let initialRetryTime = conf("KAFKA_INITIAL_RETRY_TIME", 300);
        let maxRetryTime = conf("KAFKA_MAX_RETRY_TIME", 30000);
        let retries = conf("KAFKA_RETRIES", 5);
        let maxInFlightRequests = conf("KAFKA_MAX_INFLIGHT_REQUESTS", null);

        hosts = options.hosts === undefined ? hosts : options.hosts;
        clientId = options.clientId === undefined ? clientId : options.clientId;
        connectionTimeout =
            options.connectionTimeout === undefined ? connectionTimeout : options.connectionTimeout;
        requestTimeout = options.requestTimeout ? requestTimeout : options.requestTimeout;
        initialRetryTime = options.initialRetryTime ? initialRetryTime : options.initialRetryTime;
        maxRetryTime = options.maxRetryTime ? maxRetryTime : options.maxRetryTime;
        retries = options.retries ? retries : options.retries;
        maxInFlightRequests = options.maxInFlightRequests
            ? maxInFlightRequests
            : options.maxInFlightRequests;

        this._client = new Kafka({
            brokers: hosts.split(","),
            clientId: clientId,
            connectionTimeout: connectionTimeout,
            requestTimeout: requestTimeout,
            retry: {
                initialRetryTime: initialRetryTime,
                maxRetryTime: maxRetryTime,
                retries: retries,
                maxInFlightRequests: maxInFlightRequests
            }
        });
    }

    get client() {
        return this._client;
    }
}
