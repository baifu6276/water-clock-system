// Test-only AST instrumentation: evaluate logical operands separately without printing values.
const fs=require('node:fs'),vm=require('node:vm'),Module=require('node:module');
const bundled=new Module('bundled-acorn');bundled._compile(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],'bundled-acorn');
const parse=bundled.exports.parse;
function trace(e,file,state,intent,bundle,p){
 const source=fs.readFileSync(file,'utf8'),ast=parse(source,{ecmaVersion:2020}),rows=[];
 const targets=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['employeeBaselineStatusEvidence_','employeeBaselineInspect_'].includes(n.id.name));
 function instrument(fn){
  const text=n=>source.slice(n.start,n.end),name=fn.id.name;
  function generic(n){let out='',cursor=n.start;const children=[];
   for(const [k,v]of Object.entries(n)){if(['start','end','loc','range'].includes(k))continue;for(const c of Array.isArray(v)?v:[v])if(c&&typeof c==='object'&&typeof c.type==='string')children.push(c);}
   children.sort((a,b)=>a.start-b.start);for(const c of children){out+=source.slice(cursor,c.start)+render(c);cursor=c.end;}return out+source.slice(cursor,n.end);
  }
  function leaf(n){if(n.type==='LogicalExpression')return render(n);return '__leaf('+JSON.stringify(name)+','+JSON.stringify(text(n))+',()=>('+generic(n)+'))';}
  function render(n){
   if(n.type==='LogicalExpression')return '__logic('+JSON.stringify(n.operator)+',()=>('+leaf(n.left)+'),()=>('+leaf(n.right)+'))';
   if(n.type==='IfStatement'){
    const bad=n.consequent.type==='ExpressionStatement'&&n.consequent.expression.type==='CallExpression'&&n.consequent.expression.callee.name==='employeeReviewRecovery_';
    const test='__condition('+JSON.stringify(name)+','+JSON.stringify(text(n.test))+','+bad+',()=>('+leaf(n.test)+'))';
    return source.slice(n.start,n.test.start)+test+source.slice(n.test.end,n.consequent.start)+render(n.consequent)+(n.alternate?source.slice(n.consequent.end,n.alternate.start)+render(n.alternate):source.slice(n.consequent.end,n.end));
   }
   return generic(n);
  }
  return render(fn);
 }
 e.ctx.__leaf=(fn,expression,work)=>{try{const value=work();rows.push({function:fn,kind:'predicate',expression,result:Boolean(value)});return value;}catch(_){rows.push({function:fn,kind:'predicate',expression,result:'EVALUATION_ERROR'});throw Error('OFFLINE_PREDICATE_ERROR');}};
 e.ctx.__logic=(op,a,b)=>{let x,y,ex,ey;try{x=a();}catch(z){ex=z;}try{y=b();}catch(z){ey=z;}if(ex)throw ex;if((op==='&&'?x:!x)&&ey)throw ey;return op==='&&'?(x?y:x):(x?x:y);};
 e.ctx.__condition=(fn,expression,rejects,work)=>{const result=work();rows.push({function:fn,kind:'guard',expression,rejects:Boolean(rejects&&result),result:Boolean(result)});return result;};
 for(const n of targets)vm.runInContext(instrument(n),e.ctx);
 const status=e.status(p);const normallyReachedInspect=rows.some(x=>x.function==='employeeBaselineInspect_');
 const split=rows.length;let inspect;
 try{inspect=JSON.parse(JSON.stringify(e.ctx.employeeBaselineInspect_(state,intent,bundle)));}catch(_){inspect={rejected:true};}
 return {status,normallyReachedInspect,normalTrace:rows.slice(0,split),independentInspect:{reason:'Executed separately because status may reject earlier; not a bypass of production validation',result:inspect,trace:rows.slice(split)},firstReject:rows.slice(0,split).find(x=>x.kind==='guard'&&x.rejects)||null};
}
module.exports={trace};
