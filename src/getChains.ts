import { successResponse, wrap, IResponse } from "./utils";
import protocols from "./protocols/data";
import { getLastRecord, hourlyTvl } from './utils/getLastRecord'
import { getChainDisplayName, chainCoingeckoIds } from "./utils/normalizeChain";
import { secondsInHour } from './utils/date'

const handler = async (
  _event: AWSLambda.APIGatewayEvent
): Promise<IResponse> => {
  const chainTvls = {} as {[chain:string]:number}
  await Promise.all(
    protocols.map(async (protocol) => {
      if (protocol.category === "Chain" || protocol.name === "AnySwap") {
        return undefined;
      }
      const lastTvl = await getLastRecord(hourlyTvl(protocol.id))
      if(lastTvl === undefined){
          return
      }
      let chainsAdded = 0
      Object.entries(lastTvl).forEach(([chain, chainTvl])=>{
          const chainName = getChainDisplayName(chain)
          if(chainCoingeckoIds[chainName] === undefined){
              return
          }
          chainTvls[chainName] = (chainTvls[chainName] ?? 0) + chainTvl
          chainsAdded += 1;
      })
      if(chainsAdded === 0){
        chainTvls[protocol.chain] = (chainTvls[protocol.chain] ?? 0) + lastTvl.tvl
      }
    })
  );
  const chainData = Object.entries(chainTvls).map(([chainName, chainTvl])=>({
    gecko_id: chainCoingeckoIds[chainName]?.geckoId ?? null,
    tvl: chainTvl,
    tokenSymbol: chainCoingeckoIds[chainName]?.symbol ?? null,
    cmcId: chainCoingeckoIds[chainName]?.cmcId ?? null,
    name: chainName
  }))

  return successResponse(chainData, 10 * 60); // 10 mins cache
};

export default wrap(handler);
