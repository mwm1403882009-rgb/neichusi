const model=require('../../utils/model');
const speech=require('../../utils/speech');
defineScreen(require('../../utils/home-assistant').enhance({
  data:{input:'',images:[],messages:[],busy:false,onlineSearch:false,recording:false,voiceBusy:false,voiceNotice:'',notice:''},
  voiceInput(){if(!this.voice)this.onLoad();this.voice.toggle();},
  voiceSettings(){speech.settings();},
  onSearch(event){this.setData({onlineSearch:!!event.detail.value});platform.setStorageSync('ysf-online-search',!!event.detail.value);},
  async addImages(){
    try{const added=await model.chooseImages(6-this.data.images.length);this.setData({images:this.data.images.concat(added).slice(0,6)});}
    catch(error){this.setData({notice:error.message});}
  },
  removeImage(event){this.setData({images:this.data.images.filter((_,index)=>index!==Number(event.currentTarget.dataset.index))});},
  recipes(){platform.switchTab({url:'/pages/recipes/index'});}
}));
