import { GeneratedSchema } from './schema';
import { stringLimits, limitsPromptLine, describeShapeIssues, isShapeProblem, shapeRepairMessage, SHAPE_ERROR_PREFIX } from './shapeLimits';
const lim = stringLimits(GeneratedSchema);
const blob: any = {situation:{headline:'h',body:'b'},holdingBack:[{title:'t',body:'b',lines:[],evidence:'e'}],opportunities:[{title:'t',body:'b',sizing:'s',impact:'HIGH'}],invest:{order:[{move:'m',why:'w',modeledGain:'g'}],caveat:null},leaderPath:{whatLeaderLooksLike:'a',gap:'g',incrementalGain:'i',constraints:[]},playbook:[0,1,2,3,4].map(i=>({brand:'B'+i,doingWell:'d',vulnerable:'v',keyStat:'k'})),localMarkets:null,shifts:[],sources:[]};
const validOk = GeneratedSchema.safeParse(blob).success;
blob.playbook[4].keyStat = 'x'.repeat(197);
const r: any = GeneratedSchema.safeParse(blob);
const msg = r.success ? '' : SHAPE_ERROR_PREFIX + describeShapeIssues(r.error.issues, blob);
console.log(JSON.stringify({ n: lim.length, keyStat: lim.find(l => l.path === 'playbook[].keyStat'), city: lim.find(l => l.path === 'localMarkets.markets[].city'), lines: lim.find(l => l.path === 'holdingBack[].lines[]'),
  validOk, rejected: !r.success, msg, shape: isShapeProblem(msg), groundingNotShape: !isShapeProblem('Unsupported number(s) not found in stored data: 12.7'),
  parseShape: isShapeProblem('JSON parse failed: x') && isShapeProblem('No JSON object found in the reply.'), repair: shapeRepairMessage(msg, GeneratedSchema), line: limitsPromptLine(GeneratedSchema) }));
