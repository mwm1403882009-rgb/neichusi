const photos=require('../../utils/photos');
const native=require('../../utils/native-input');
const store = require('../../utils/store');
const { today } = require('../../utils/date');
const recipeData=require('../../utils/recipe-data');
function blank() { return { id:'',name:'',emoji:'🍳',source:'手动录入',sourceUrl:'',plannedDate:today(),servings:null,cost:null,prepMinutes:null,ingredients:[],steps:[],notes:'',tags:[] }; }
defineScreen({
  data:{draft:blank(),photoIcon:'🍽️',ingredientsText:'',stepsText:'',tagsText:'',isNew:true,historyId:'',snapshotMode:false,categories:recipeData.categories.slice(1),categoryIndex:0},
  onLoad(query){
    const data=store.getData(),history=query.historyId?data.history.find(row=>row.id===query.historyId):null;
    const item=history?(history.recipeSnapshot||data.recipes.find(row=>row.id===history.recipeId)):(query.id?data.recipes.find(row=>row.id===query.id):null);
    const draft=photos.view(item?JSON.parse(JSON.stringify(item)):blank());
    if(history){draft.name=history.name;draft.plannedDate=history.date;draft.cost=history.totalCost==null?null:history.totalCost;}
    draft.category=recipeData.classify(draft);this.setData({draft,photoIcon:photos.icon(draft),categoryIndex:this.data.categories.indexOf(draft.category),isNew:!item,historyId:history?history.id:'',snapshotMode:!!history,ingredientsText:(draft.ingredients||[]).join('\n'),stepsText:(draft.steps||[]).join('\n'),tagsText:(draft.tags||[]).join('、')});
  },
  edit(event){
    const field=event.currentTarget.dataset.field;let value=event.detail.value;
    native.capture(this,'draft.'+field,value);if(field==='name'||field==='emoji')this.setData({photoIcon:photos.icon(this.data.draft)});
  },
  lines(event){const field=event.currentTarget.dataset.field,text=event.detail.value,split=field==='tags'?text.split(/[、,，\n]/):text.split('\n');native.capture(this,'draft.'+field,split.map(row=>row.trim()).filter(Boolean));native.capture(this,event.currentTarget.dataset.text,text);},
  photo(event){this.setData({'draft.photoPath':event.detail.value});},
  chooseCategory(event){const categoryIndex=Number(event.detail.value);this.setData({categoryIndex,'draft.category':this.data.categories[categoryIndex]});},
  save(){
    let draft;try{draft=recipeData.numbers(this.data.draft);}catch(error){return platform.showToast({title:error.message,icon:'none'});}if(!draft.name.trim())return platform.showToast({title:'请填写菜名',icon:'none'});
    if(!draft.id)draft.id=store.id('recipe');
    try{
      store.update(data=>{
        if(this.data.historyId){
          const history=data.history.find(row=>row.id===this.data.historyId);
          if(!history)throw new Error('这条历史已被删除');
          history.recipeSnapshot=draft;history.name=draft.name;
          history.totalCost=draft.cost;history.unitPrice=draft.servings&&draft.cost!=null?Math.round(draft.cost*100/draft.servings)/100:null;
          history.costManuallyAdjusted=true;
        }else{
          const index=data.recipes.findIndex(row=>row.id===draft.id);if(index>=0)data.recipes[index]=draft;else data.recipes.unshift(draft);
        }
      });
      platform.showToast({title:'已保存'});setTimeout(()=>platform.navigateBack(),400);
    }catch(error){platform.showToast({title:error.message,icon:'none'});}
  },
  remove(){
    if(this.data.snapshotMode)return;
    if(this.data.isNew)return platform.navigateBack();
    platform.showModal({title:'删除这道菜谱？',content:'已有历史快照继续保留。',success:result=>{if(!result.confirm)return;store.update(data=>{data.recipes=data.recipes.filter(row=>row.id!==this.data.draft.id);});platform.navigateBack();}});
  }
});
