import { craftProtocolsResponse } from "./getProtocols";
import { wrapScheduledLambda } from "./utils/wrap";
import { store } from "./utils/s3";
import { constants, brotliCompressSync } from "zlib";

function compress(data: string) {
  return brotliCompressSync(data, {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
  });
}

const handler = async (_event: any) => {
  const response = await craftProtocolsResponse();
  const trimmedResponse = response.map((protocol) => ({
    category: protocol.category,
    chains: protocol.chains,
    chainTvls: protocol.chainTvls,
    change_1d: protocol["change_1d"],
    change_7d: protocol["change_7d"],
    listedAt: protocol.listedAt,
    mcap: protocol.mcap,
    mcaptvl: protocol.mcap ? protocol.mcap / protocol.tvl : undefined,
    name: protocol.name,
    symbol: protocol.symbol,
    tvl: protocol.tvl,
  }));
  const compressedRespone = compress(JSON.stringify(trimmedResponse));

  await store("lite/protocols", compressedRespone, true);

  const noChainResponse = trimmedResponse.filter((p) => p.category !== "Chain");
  const chains = {} as { [chain: string]: number };
  const protocolCategoriesSet = new Set();
  noChainResponse.forEach((p) => {
    protocolCategoriesSet.add(p.category);
    p.chains.forEach((c: string) => {
      chains[c] = (chains[c] ?? 0) + p.chainTvls[c];
    });
  });

  const compressedV2Response = compress(
    JSON.stringify({
      protocols: noChainResponse,
      chains: Object.entries(chains)
        .sort((a, b) => b[1] - a[1])
        .map((c) => c[0]),
      protocolCategories: [...protocolCategoriesSet].filter(
        (category) => category
      ),
    })
  );
  await store("lite/protocols2", compressedV2Response, true);
};

export default wrapScheduledLambda(handler);
