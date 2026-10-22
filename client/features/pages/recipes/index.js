const photos=require('../../utils/photos');
const store=require('../../utils/store');
const recipeData=require('../../utils/recipe-data');
const historyRecipes=require('../../utils/history-recipes');
function view(items){return items.map(item=>({...photos.view(item),category:recipeData.classify(item),meta:[item.servings==null?'份数待补':item.servings+'份',item.cost==null?'成本待补':'¥'+Number(item.cost).toFixed(2)].join(' · ')}));}
defineScreen({
  data:{query:'',recipes:[],shown:[],categories:recipeData.categories,category:'全部',showImport:false,showHistory:false,historyRows:[],selectedHistory:{},notice:''},
  onShow(){this.load();},
  load(){const data=store.getData(),recipes=view(data.recipes);this.setData({recipes,shown:this.filter(recipes,this.data.query),historyRows:historyRecipes.list(data).map(row=>({id:row.history.id,name:row.history.name,date:row.history.date,mealSlot:row.history.mealSlot,costText:row.draft.cost==null?'金额待补':'¥'+Number(row.draft.cost).toFixed(2),duplicate:!!row.duplicateId,missingSteps:!row.draft.steps.length}))});},
  filter(items,q){const key=q.trim().toLowerCase();return items.filter(item=>(this.data.category==='全部'||item.category===this.data.category)&&(!key||[item.name,...(item.tags||[]),...(item.ingredients||[])].join(' ').toLowerCase().includes(key)));},
  search(event){const query=event.detail.value;this.setData({query,shown:this.filter(this.data.recipes,query)});},
  chooseCategory(event){this.setData({category:event.currentTarget.dataset.category});this.setData({shown:this.filter(this.data.recipes,this.data.query)});},
  photoError(event){const id=event.currentTarget.dataset.id,update={};['recipes','shown'].forEach(field=>{const index=this.data[field].findIndex(row=>row.id===id);if(index>=0)update[field+'['+index+'].photoFailed']=true;});this.setData(update);},
  open(event){platform.navigateTo({url:'/pages/recipe-edit/index?id='+event.currentTarget.dataset.id});},
  add(){platform.navigateTo({url:'/pages/recipe-edit/index'});},
  importRecipe(){this.setData({showImport:!this.data.showImport});},
  externalImport(){platform.navigateTo({url:'/pages/recipe-import/index'});},
  fromHistory(){this.setData({showHistory:!this.data.showHistory,notice:''});this.load();},
  toggleHistory(event){const id=event.currentTarget.dataset.id;this.setData({selectedHistory:{...this.data.selectedHistory,[id]:!this.data.selectedHistory[id]}});},
  importHistory(event){const ids=Object.keys(this.data.selectedHistory).filter(id=>this.data.selectedHistory[id]),mode=event.currentTarget.dataset.mode;if(!ids.length)return this.setData({notice:'请先选一条或多条已吃的自炒记录。'});platform.showModal({title:mode==='copy'?'另存为新菜谱？':'导入 / 更新所选菜谱？',content:'按当时的菜名、用料、做法和金额导入；缺失做法保留待补。更新只影响我的菜谱，不修改历史或扣库存。同一菜谱多个记录按所选日期顺序更新，最后保留较新的记录。',success:result=>{if(!result.confirm)return;try{let total;store.update(data=>{total=historyRecipes.importSelected(data,ids,mode,store.id);});this.setData({selectedHistory:{},notice:'已新增'+total.created+'份，更新'+total.updated+'份。'});this.load();}catch(error){this.setData({notice:error.message});}}});}
});
