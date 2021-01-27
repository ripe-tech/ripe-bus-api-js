import { ConsumerCallback, BindOptions } from "../base";

export type KafkaRetryBindOptions = BindOptions & {
    onSuccess?: ConsumerCallback,
    onError?: ConsumerCallback,
    retries?: number
}

export declare class KafkaRetryConsumer {
    constructor();
    consume(topic: string, options: KafkaRetryBindOptions): Promise<void>;
}
