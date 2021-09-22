# apollo-link-batch-alias
Batches multiple operations into a single HTTP request. Uses aliasies under the hood.

## Installation

`npm install @mir-dit/apollo-link-batch-alias --save`

## Usage

```typescript
import { AliasBatchHttpLink } from '@mir-dit/apollo-link-batch-alias';

const link: AliasBatchHttpLink = new AliasBatchHttpLink({ uri, batchMax: 20, batchInterval: 300 });
```