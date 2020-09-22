import { conf } from "yonius";
import { Kafka } from "kafkajs";

export const KafkaClient = (function() {
    var client = null;
    return {
        getInstance: () => {
            if (client) return client;

            const hosts = conf("KAFKA_HOSTS", "localhost:9092").split(" ");
            client = new Kafka({
                brokers: hosts,
                clientId: conf("KAFKA_CLIENT_ID", "ripe-kafka"),
                connectionTimeout: conf("KAFKA_CONNECT_TIMEOUT", 10000),
                requestTimeout: conf("KAFKA_REQUEST_TIMEOUT", 30000),
                retry: {
                    initialRetryTime: conf("KAFKA_INITIAL_RETRY_TIME", 300),
                    maxRetryTime: conf("KAFKA_MAX_RETRY_TIME", 30000),
                    retries: conf("KAFKA_RETRIES", 5),
                    maxInFlightRequests: conf("KAFKA_MAX_INFLIGHT_REQUESTS", null)
                }
            });

            return client;
        }
    };
})();
