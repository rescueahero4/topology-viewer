import { z } from "zod/mini";

// zod 4 probes `new Function` when it makes an object schema. This turns the probe off before any
// other module makes a schema, so that the library works under a CSP with no `unsafe-eval`.
z.config({ jitless: true });
