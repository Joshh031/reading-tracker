// Compatibility endpoint: metadata only; all analysis now goes through the sourced pipeline.
import vaultHandler from './vault.js';
export default function handler(req,res){req.body={action:'resolve',url:req.body?.url};return vaultHandler(req,res);}
