import { successResponse, wrap, IResponse } from "./utils";
import protocols, { Protocol } from "./protocols/data";
import { getLastRecord, hourlyTvl } from "./utils/getLastRecord";
import sluggify from "./utils/sluggify";
import { normalizeChain, getDisplayChain } from "./utils/normalizeChain";
import dynamodb from "./utils/dynamodb";

export function getPercentChange(previous: number, current: number) {
  const change = (current / previous) * 100 - 100;
  if (change == Infinity) {
    return null;
  }
  return change;
}

const handler = async (
  _event: AWSLambda.APIGatewayEvent
): Promise<IResponse> => {
  const response = (
    await Promise.all(
      protocols.map(async (protocol) => {
        const lastHourlyRecord = await getLastRecord(hourlyTvl(protocol.id));
        if (lastHourlyRecord === undefined) {
          return null;
        }
        const returnedProtocol: Partial<Protocol> = { ...protocol };
        delete returnedProtocol.module;
        const chainTvls = {} as {
          [chain: string]: number;
        };
        protocol.chains.forEach((chain) => {
          const normalizedChain = normalizeChain(chain);
          const chainTvl = lastHourlyRecord[normalizedChain];
          if (chainTvl !== undefined) {
            chainTvls[chain] = chainTvl;
          }
        });
        const dataToReturn = {
          ...protocol,
          slug: sluggify(protocol),
          tvl: lastHourlyRecord.tvl,
          chainTvls,
          chain: getDisplayChain(protocol.chains),
          change_1h: getPercentChange(
            lastHourlyRecord.tvlPrev1Hour,
            lastHourlyRecord.tvl
          ),
          change_1d: getPercentChange(
            lastHourlyRecord.tvlPrev1Day,
            lastHourlyRecord.tvl
          ),
          change_7d: getPercentChange(
            lastHourlyRecord.tvlPrev1Week,
            lastHourlyRecord.tvl
          ),
        } as any;
        for (let extraData of ["staking", "pool2"]) {
          if (lastHourlyRecord[extraData] !== undefined) {
            dataToReturn[extraData] = lastHourlyRecord[extraData]
          }
        }
        if (typeof protocol.gecko_id === "string") {
          const coingeckoData = await dynamodb.get({
            Key:{
              PK: `asset#${protocol.gecko_id}`,
              SK: 0
            }
          })
          if(coingeckoData.Item !== undefined){
            dataToReturn.fdv = coingeckoData.Item.fdv;
            dataToReturn.mcap = coingeckoData.Item.mcap;
          }
        }
        return dataToReturn
      })
    )
  ).filter((protocol) => protocol !== null);
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);