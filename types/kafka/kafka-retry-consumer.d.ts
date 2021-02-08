import { KafkaBindOptions } from "./kafka-consumer";

export type KafkaRetryBindOptions = KafkaBindOptions & {
    retries?: number
    messageFailureMaxTime?: number,
    messageDelayExponential?: number
}

export declare class KafkaRetryConsumer {
    constructor();
    consume(topic: string, options: KafkaRetryBindOptions): Promise<void>;
}
