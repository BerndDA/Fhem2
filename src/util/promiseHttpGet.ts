/// <reference types="node" />
"use strict";

import * as http from "http";

export default async function getContent(url: string): Promise<any> {
    // return new pending promise
    return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            // handle http errors
            if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error(`Failed to load page, status code: ${response.statusCode}`));
            }
            // temporary data holder
            const body: string[] = [];
            // on every content chunk, push it to the data array
            response.on("data", (chunk) => body.push(chunk));
            // we are done, resolve promise with those joined chunks
            response.on("end", () => {
                if (!response.headers["content-type"] || response.headers["content-type"].indexOf("json") !== -1) {
                    resolve(JSON.parse(body.join("")));
                } else {
                    resolve(body.join(""));
                }
            });
        });
        // handle connection errors of the request
        request.on("error", (err) => reject(err));
    });
}