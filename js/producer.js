import { NotImplementedError } from "yonius";

export class Producer {
    async connect() {
        throw new NotImplementedError();
    }

    async produce(topic, message) {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }
}
