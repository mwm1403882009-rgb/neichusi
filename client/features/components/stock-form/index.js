const stock=require('../../utils/stock');
const photos=require('../../utils/photos');
const fields=['photoPath','name','type','originalName','amount','unit','totalPrice','portions','physicalAmount','physicalUnit','purchaseDate','stockedDate','shelfDays','expiryMode','shelfStart','expiryDate','storageMode','platform'];
defineWidget({
  options:{styleIsolation:'apply-shared'},
  properties:{templateMode:{type:Boolean,value:false},value:{type:Object,value:{}},errors:{type:Object,value:{}}},
  data:{photoIcon:'🍽️',form:{},storage:['待填写','冷藏','冷冻','常温'],starts:['从购买日期起算','从入库日期起算'],expiryModes:['填写保存天数','填写包装到期日'],storageIndex:0,startIndex:0,expiryIndex:0,expiryPreview:''},
  observers:{value(row){if(row)this.syncForm(row);}},
  methods:{
    syncForm(row){
      const update={},form=this.data.form||{};fields.forEach(field=>{if(this.focusedField===field)return;const value=row[field]==null?'':row[field];if(form[field]!==value)update['form.'+field]=value;});
      const next={...form,...row},normalized=stock.normalize(next);
      Object.assign(update,{photoIcon:photos.icon(next),storageIndex:Math.max(0,this.data.storage.indexOf(next.storageMode||'待填写')),startIndex:next.shelfStart==='stocked'?1:0,expiryIndex:next.expiryMode==='date'?1:0,expiryPreview:normalized.expiryDate});this.setData(update);
    },
    photo(event){this.setData({'form.photoPath':event.detail.value});this.triggerEvent('change',{field:'photoPath',value:event.detail.value,input:false});},
    toggleOriginal(){this.setData({showOriginal:!this.data.showOriginal});},
    focus(event){this.focusedField=event.currentTarget.dataset.field;},
    blur(event){const field=event.currentTarget.dataset.field;this.focusedField='';if(event.detail.value!=null)this.data.form[field]=event.detail.value;this.triggerEvent('change',{field,value:this.data.form[field],input:false});this.syncForm(this.data.form);},
    edit(event){const field=event.currentTarget.dataset.field,value=event.detail.value;this.data.form[field]=value;const input=event.type!=='change';if(!input){this.setData({['form.'+field]:value});this.syncForm(this.data.form);}this.triggerEvent('change',{field,value,input});},
    pick(event){
      const field=event.currentTarget.dataset.field,index=Number(event.detail.value),value=field==='storageMode'?(this.data.storage[index]==='待填写'?'':this.data.storage[index]):field==='shelfStart'?(index?'stocked':'purchase'):(index?'date':'days');
      this.setData({['form.'+field]:value});this.syncForm(this.data.form);this.triggerEvent('change',{field,value,input:false});
    }
  }
});
