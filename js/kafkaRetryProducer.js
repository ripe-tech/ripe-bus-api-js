import { KafkaProducer } from "./kafkaProducer";

export class KafkaRetryProducer extends KafkaProducer {
    constructor(options = {}) {
        super(options);
    }
}
