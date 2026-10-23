import { config } from 'dotenv';
import { resolve } from 'node:path';

// Shell variables win (CI sets hosts/ports); .env.test fills the rest.
config({ path: resolve(__dirname, '..', '..', '.env.test'), override: false, quiet: true });
