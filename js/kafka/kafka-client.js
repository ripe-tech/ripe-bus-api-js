import { conf } from "yonius";
import { Kafka, CompressionTypes } from "kafkajs";

export const KafkaClient = (function() {
    let client = null;
    return {
        getInstance: (options = {}) => {
            if (client) return client;

            const hosts =
                options.hosts === undefined ? conf("KAFKA_HOSTS", "localhost:9092") : options.hosts;
            const clientId =
                options.clientId === undefined
                    ? conf("KAFKA_CLIENT_ID", "ripe-kafka")
                    : options.clientId;
            const connectionTimeout =
                options.connectionTimeout === undefined
                    ? conf("KAFKA_CONNECT_TIMEOUT", 10000)
                    : options.connectionTimeout;
            const requestTimeout = options.requestTimeout
                ? conf("KAFKA_REQUEST_TIMEOUT", 30000)
                : options.requestTimeout;
            const initialRetryTime = options.initialRetryTime
                ? conf("KAFKA_INITIAL_RETRY_TIME", 300)
                : options.initialRetryTime;
            const maxRetryTime = options.maxRetryTime
                ? conf("KAFKA_MAX_RETRY_TIME", 30000)
                : options.maxRetryTime;
            const retries = options.retries ? conf("KAFKA_RETRIES", 5) : options.retries;
            const maxInFlightRequests = options.maxInFlightRequests
                ? conf("KAFKA_MAX_INFLIGHT_REQUESTS", null)
                : options.maxInFlightRequests;

            client = new Kafka({
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

            return client;
        }
    };
})();

export const convertCompressionTypes = function(compression) {
    switch (compression) {
        case "gzip":
            return CompressionTypes.GZIP;
        default:
            return CompressionTypes.None;
    }
};
