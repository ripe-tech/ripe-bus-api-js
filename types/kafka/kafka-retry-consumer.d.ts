import { ConsumerCallback, BindOptions } from "../base";

export type KafkaRetryBindOptions = BindOptions & {
    onSuccess?: ConsumerCallback,
    onError?: ConsumerCallback,
    retries?: number
}
