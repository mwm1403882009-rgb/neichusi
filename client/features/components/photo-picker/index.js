const photos=require('../../utils/photos');
defineWidget({
  properties:{value:{type:String,value:''},icon:{type:String,value:'🍽️'},title:{type:String,value:'照片'}},
  data:{busy:false,failed:false,notice:''},
  observers:{value(){this.setData({failed:false,notice:''});}},
  methods:{
    async choose(){if(this.data.busy)return;this.setData({busy:true,notice:''});try{const path=await photos.choose();this.triggerEvent('change',{value:path});this.setData({failed:false,notice:'照片已保存在本机，请保存当前资料。'});}catch(error){if(!error.canceled)this.setData({notice:error.message});}finally{this.setData({busy:false});}},
    remove(){this.triggerEvent('change',{value:''});this.setData({failed:false,notice:'已取消关联，保存后使用默认图案；历史照片文件不删除。'});},
    preview(){if(!this.data.failed)photos.preview(this.data.value);},
    imageError(){this.setData({failed:true,notice:'原照片无法读取，暂用默认图案；可重新添加。'});}
  }
});
