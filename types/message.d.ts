import { Payload } from "./payload";

export type Message = {
    name: string,
    origin?: string,
    hostname: string,
    datatype: string,
    timestamp: number,
    payload: Payload
};
