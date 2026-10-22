// Android's synchronous encrypted bridge must not run on each native text edit.
// Keep the visible text/cursor local; commit one draft after idle or before an action.
const store=require('../features/utils/store.js');
const planning=require('../features/utils/planning.js');
const recipeData=require('../features/utils/recipe-data.js');
const inventory=require('../features/utils/inventory.js');
const mealStats=require('../features/utils/meal-stats.js');
const shopping=require('../features/utils/meal-shopping.js').list;
const IDLE_MS=450;

function cancelTimer(owner){if(owner._inputSaveTimer!=null){clearTimeout(owner._inputSaveTimer);owner._inputSaveTimer=null;}}
function enhance(definition){
  const next={...definition};
  next.saveInput=function(patch){
    const current=this.data.current;if(!current)return;
    if(this._pendingInput&&(this._pendingInput.weekStart!==this.data.weekStart||this._pendingInput.day.id!==current.id)){
      if(!this.flushPendingInput())return;
    }
    const day={...current,...patch},days=Array.isArray(this.data.days)?this.data.days:this.liveDays();
    this.data.current=day;days[this.data.selectedIndex]=day;this.data.days=days;
    this._pendingInput={weekStart:this.data.weekStart,day,prompt:this.data.prompt,reconcile:!!this._pendingInput?.reconcile||Object.hasOwn(patch,'ingredients')};
    cancelTimer(this);
    this._inputSaveTimer=setTimeout(()=>{this._inputSaveTimer=null;this.flushPendingInput();},IDLE_MS);
  };
  next.editLines=function(event){
    const field=event.currentTarget.dataset.field,text=event.detail.value;
    if(field==='ingredients')this.data.ingredientsText=text;
    this.saveInput({[field]:recipeData.lines(text)});
  };
  next.flushPendingInput=function(){
    if(this._flushingInput)return true;
    cancelTimer(this);const pending=this._pendingInput;if(!pending)return true;
    this._flushingInput=true;
    try{
      let day=pending.day;
      const data=store.update(data=>{
        if(pending.reconcile)day={...day,ingredientUses:inventory.reconcileUses(day.ingredients,data.fridge,day.ingredientUses||[]),matchWarnings:[]};
        const saved=planning.getWeek(data,pending.weekStart);
        if(!saved.days.some(row=>row.id===day.id))throw Error('原餐次已变化，输入仍保留，请先备份或核对餐次');
        const clean=recipeData.normalize(day);for(const key of ['dateShort','displayName','costText'])delete clean[key];
        planning.putWeek(data,pending.weekStart,saved.days.map(row=>row.id===day.id?clean:row),saved.batchSteps,pending.prompt);
      });
      if(this.data.weekStart===pending.weekStart&&this.data.current?.id===day.id){
        const index=this.data.selectedIndex;this.data.current=day;this.data.days[index]=day;
        const quote=inventory.quote(day,data.fridge),history=day.confirmedAt&&(data.history.find(row=>row.id===day.historyId)||data.history.find(row=>row.date===day.date&&row.mealSlot===day.mealSlot));
        this.setData({stats:mealStats.summary(data,pending.weekStart,this.data.days),costQuote:quote,shopping:shopping(this.data.days,data.history),['days['+index+'].displayName']:day.mealType==='other'?(day.otherInfo||'外食 / 其他'):(day.name||'待安排'),['days['+index+'].costText']:history?(history.totalCost==null?'金额待补':'¥'+Number(history.totalCost).toFixed(2)):quote.text});
      }
      this._pendingInput=null;return true;
    }catch(error){
      this.setData({notice:error.message||'保存失败，输入仍保留',noticeType:'error'});
      platform.showToast({title:'保存未完成，输入仍保留，请先备份并检查存储空间'});return false;
    }finally{this._flushingInput=false;}
  };
  // Flush before actions read the draft or change its identity. Cleanup still runs on save failure.
  const editing=new Set(['saveInput','editLines','editField','editMethod','costInput','liveDays']);
  for(const [name,method]of Object.entries(definition)){
    if(typeof method!=='function'||editing.has(name))continue;
    next[name]=function(...args){const saved=this.flushPendingInput();if(!saved&&name!=='onHide'&&name!=='onUnload')return false;return method.apply(this,args);};
  }
  return next;
}
module.exports={enhance,IDLE_MS};
