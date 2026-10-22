package cn.neichusi.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Matrix;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.ExifInterface;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net",ORIGIN="https://"+HOST,KEY_ALIAS="neichusi.storage.v1";
  private WebView web;
  private SharedPreferences storage;
  private SecretKey secret;
  private final ExecutorService io=Executors.newFixedThreadPool(4);
  private final Handler main=new Handler(Looper.getMainLooper());
  private String imageCall,permissionCall;
  private int imageLimit=1;
  private File cameraFile;
  private volatile boolean recording=false;
  private AudioRecord audio;
  private volatile boolean destroyed=false;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    try{
      storage=getSharedPreferences("neichusi.encrypted.v1",MODE_PRIVATE);
      KeyStore keyStore=KeyStore.getInstance("AndroidKeyStore");keyStore.load(null);
      if(!keyStore.containsAlias(KEY_ALIAS)){
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
      }
      secret=(SecretKey)keyStore.getKey(KEY_ALIAS,null);
    }catch(Exception error){new AlertDialog.Builder(this).setTitle("本机安全存储无法打开").setMessage("没有清除原数据。请重启手机后再试；不要卸载App。\n"+error.getMessage()).setPositiveButton("关闭",(d,w)->finish()).show();return;}
    new File(getFilesDir(),"media").mkdirs();new File(getCacheDir(),"media").mkdirs();
    FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(36,75,59));
    web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
    android.content.pm.PackageInfo webPackage=WebView.getCurrentWebViewPackage();
    try{if(webPackage!=null&&Integer.parseInt(webPackage.versionName.split("\\.")[0])<100){new AlertDialog.Builder(this).setTitle("需要更新系统网页组件").setMessage("内厨司需要100或更新版本的Android System WebView / Chrome。请通过手机系统的更新功能升级后重新打开；原数据没有清除。").setPositiveButton("关闭",(d,w)->finish()).setCancelable(false).show();return;}}catch(NumberFormatException ignored){}
    if(Build.VERSION.SDK_INT>=30){
      getWindow().setDecorFitsSystemWindows(false);
      root.setOnApplyWindowInsetsListener((view,insets)->{Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()),keyboard=insets.getInsets(WindowInsets.Type.ime());view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));return WindowInsets.CONSUMED;});
    }
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setMediaPlaybackRequiresUserGesture(true);settings.setTextZoom(100);
    WebView.setWebContentsDebuggingEnabled(false);
    web.addJavascriptInterface(new Bridge(),"AndroidBridge");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        Uri url=request.getUrl();
        if(isLocal(url)&&!request.isForMainFrame())return false;
        if(isLocal(url)&&"/index.html".equals(url.getPath()))return false;
        if(request.isForMainFrame()&&"https".equals(url.getScheme()))new AlertDialog.Builder(MainActivity.this).setTitle("在浏览器打开外部链接？").setMessage(url.getHost()).setNegativeButton("取消",null).setPositiveButton("打开",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}}).show();
        return true;
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        try{
          Uri uri=request.getUrl();if(!isLocal(uri)||!"GET".equals(request.getMethod()))return denied();
          String path=uri.getPath();
          if(path.startsWith("/media/")||path.startsWith("/temp/")){File file=localFile(uri.toString());return new WebResourceResponse(mime(file.getName()),null,new FileInputStream(file));}
          String name="/".equals(path)?"index.html":path.substring(1);
          if(!Arrays.asList("index.html","app.js","app.css","THIRD_PARTY_LICENSES.txt").contains(name))return denied();
          return new WebResourceResponse(mime(name),"UTF-8",getAssets().open(name));
        }catch(Exception error){return denied();}
      }
    });
    web.loadUrl(ORIGIN+"/index.html");
  }
  private boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&uri.getPort()==-1;}
  private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private static String mime(String name){name=name.toLowerCase(Locale.ROOT);if(name.endsWith(".html"))return "text/html";if(name.endsWith(".js"))return "text/javascript";if(name.endsWith(".css"))return "text/css";if(name.endsWith(".png"))return "image/png";if(name.endsWith(".webp"))return "image/webp";if(name.endsWith(".gif"))return "image/gif";if(name.endsWith(".wav"))return "audio/wav";return "image/jpeg";}
  private String pathFor(File file){return ORIGIN+(file.getParentFile().equals(new File(getFilesDir(),"media"))?"/media/":"/temp/")+file.getName();}
  private File localFile(String url)throws Exception{
    Uri uri=Uri.parse(url);if(!isLocal(uri))throw new Exception("只能读取App内选择的文件，请重新添加照片");
    String path=uri.getPath();if(!path.matches("/(media|temp)/[a-zA-Z0-9._-]+"))throw new Exception("文件路径无效");
    File base=path.startsWith("/media/")?new File(getFilesDir(),"media"):new File(getCacheDir(),"media");
    File file=new File(base,uri.getLastPathSegment());if(!file.getCanonicalFile().getParentFile().equals(base.getCanonicalFile()))throw new Exception("文件路径无效");return file;
  }
  private void result(String id,boolean success,Object value){if(destroyed)return;String encoded=value==null?"null":value instanceof JSONObject||value instanceof JSONArray?value.toString():JSONObject.quote(String.valueOf(value));main.post(()->{if(!destroyed&&web!=null)web.evaluateJavascript("window.__nativeResult("+JSONObject.quote(id)+","+success+","+encoded+")",null);});}
  private void recorderEvent(String kind,Object value){if(destroyed)return;main.post(()->{if(!destroyed&&web!=null)web.evaluateJavascript("window.__recorderEvent("+JSONObject.quote(kind)+","+value.toString()+")",null);});}
  private static JSONObject object(String key,Object value)throws Exception{return new JSONObject().put(key,value);}
  private static byte[] readLimited(InputStream stream,int limit)throws Exception{try(InputStream input=stream;ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>limit)throw new Exception("文件或响应过大，请分批处理");output.write(buffer,0,count);}return output.toByteArray();}}
  public final class Bridge {
    @JavascriptInterface public synchronized String get(String key){try{String raw=storage.getString(key,"");if(raw.isEmpty())return "";byte[] combined=Base64.decode(raw,Base64.NO_WRAP);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secret,new GCMParameterSpec(128,Arrays.copyOfRange(combined,0,12)));return new String(cipher.doFinal(Arrays.copyOfRange(combined,12,combined.length)),StandardCharsets.UTF_8);}catch(Exception error){throw new IllegalStateException("数据解密失败；原数据未清除",error);}}
    @JavascriptInterface public synchronized boolean set(String key,String value){try{if(key.length()>200||value.length()>2000000)return false;Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secret);byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));byte[] combined=new byte[12+encrypted.length];System.arraycopy(cipher.getIV(),0,combined,0,12);System.arraycopy(encrypted,0,combined,12,encrypted.length);return storage.edit().putString(key,Base64.encodeToString(combined,Base64.NO_WRAP)).commit();}catch(Exception error){return false;}}
    @JavascriptInterface public synchronized boolean remove(String key){return storage.edit().remove(key).commit();}
    @JavascriptInterface public void invoke(String id,String method,String json){try{JSONObject args=new JSONObject(json);switch(method){
      case "request":io.execute(()->request(id,args));break;
      case "microphonePermission":main.post(()->microphone(id));break;
      case "recordStart":main.post(()->startRecording(id,args.optInt("duration",60000)));break;
      case "recordStop":recording=false;result(id,true,new JSONObject());break;
      case "chooseImages":main.post(()->chooseImages(id,args.optInt("count",1)));break;
      case "readFile":io.execute(()->{try{byte[] bytes=readLimited(new FileInputStream(localFile(args.optString("path"))),10*1024*1024);result(id,true,object("data",Base64.encodeToString(bytes,Base64.NO_WRAP)));}catch(Exception error){result(id,false,error.getMessage());}});break;
      case "saveFile":io.execute(()->{try{File source=localFile(args.optString("path"));if(source.length()>8*1024*1024)throw new Exception("单张照片不能超过8MB");File target=new File(new File(getFilesDir(),"media"),"photo-"+UUID.randomUUID()+extension(source.getName()));try(FileInputStream in=new FileInputStream(source);FileOutputStream out=new FileOutputStream(target)){byte[] bytes=new byte[32768];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);out.getFD().sync();}result(id,true,object("savedFilePath",pathFor(target)));}catch(Exception error){result(id,false,error.getMessage());}});break;
      case "compressImage":io.execute(()->compressImage(id,args));break;
      case "clipboardSet":main.post(()->{try{((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("内厨司备份",args.optString("text")));result(id,true,new JSONObject());}catch(Exception error){result(id,false,"无法复制，请检查剪贴板权限");}});break;
      case "clipboardGet":main.post(()->{try{ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);ClipData data=clipboard.getPrimaryClip();result(id,true,object("data",data==null?"":data.getItemAt(0).coerceToText(MainActivity.this).toString()));}catch(Exception error){result(id,false,"无法读取剪贴板，可手动粘贴");}});break;
      case "settings":main.post(()->{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));result(id,true,new JSONObject());});break;
      case "minimize":main.post(()->{moveTaskToBack(true);result(id,true,new JSONObject());});break;
      default:result(id,false,"不支持的本机操作");
    }}catch(Exception error){result(id,false,error.getMessage());}}
  }
  private static String extension(String name){int dot=name.lastIndexOf('.');String ext=dot<0?".jpg":name.substring(dot).toLowerCase(Locale.ROOT);return Arrays.asList(".jpg",".jpeg",".png",".webp",".gif",".wav").contains(ext)?ext:".jpg";}
  private void request(String id,JSONObject args){HttpsURLConnection connection=null;try{
    URL url=new URL(args.getString("url"));String method=args.optString("method","GET");boolean publicRead=RequestPolicy.isPublic(url,method);
    int timeout=Math.max(1000,Math.min(args.optInt("timeout",65000),70000));
    connection=(HttpsURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setConnectTimeout(Math.min(timeout,20000));connection.setReadTimeout(timeout);connection.setRequestMethod(method);
    JSONObject headers=args.optJSONObject("headers");if(headers!=null){Iterator<String> iterator=headers.keys();while(iterator.hasNext()){String key=iterator.next();if(RequestPolicy.headerAllowed(publicRead,key))connection.setRequestProperty(key,headers.getString(key));}}
    if("POST".equals(method)&&args.has("data")&&!args.isNull("data")){byte[] bytes=args.get("data").toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>15*1024*1024)throw new Exception("请求过大，请分批上传图片或录音");connection.setDoOutput(true);connection.setFixedLengthStreamingMode(bytes.length);try(java.io.OutputStream output=connection.getOutputStream()){output.write(bytes);}}
    int status=connection.getResponseCode();if(status>=300&&status<400&&!publicRead)throw new Exception("模型地址发生跳转，未转发密钥；请核对正式API地址");
    JSONObject responseHeaders=new JSONObject();String location=connection.getHeaderField("Location");if(publicRead&&location!=null)responseHeaders.put("Location",location);
    InputStream response=status>=300&&status<400?null:status>=400?connection.getErrorStream():connection.getInputStream();String text=response==null?"":new String(readLimited(response,publicRead?2*1024*1024:6*1024*1024),StandardCharsets.UTF_8);Object body;try{body=new JSONObject(text);}catch(Exception ignored){body=text;}
    result(id,true,new JSONObject().put("statusCode",status).put("data",body).put("header",responseHeaders).put("url",url.toExternalForm()));
  }catch(Exception error){result(id,false,"网络请求失败："+(error.getMessage()==null?"请检查网络连接":error.getMessage()));}finally{if(connection!=null)connection.disconnect();}}
  private void microphone(String id){if(permissionCall!=null){result(id,false,"正在等待麦克风授权，请稍候");return;}if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){result(id,true,new JSONObject());return;}permissionCall=id;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},201);}
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==201&&permissionCall!=null){String id=permissionCall;permissionCall=null;result(id,grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED,grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED?new JSONObject():"麦克风未获授权，请在系统设置开启后重试");}}
  private void startRecording(String id,int duration){try{
    if(recording||audio!=null)throw new Exception("上一段录音仍在结束，请稍候重试");if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new Exception("请先授权麦克风");
    int buffer=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
    AudioRecord device=new AudioRecord(MediaRecorder.AudioSource.MIC,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,buffer*2);if(device.getState()!=AudioRecord.STATE_INITIALIZED){device.release();throw new Exception("录音器未启动，请检查麦克风是否被占用");}
    audio=device;device.startRecording();if(device.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new Exception("麦克风启动失败");recording=true;result(id,true,new JSONObject());
    io.execute(()->{File file=new File(new File(getCacheDir(),"media"),"voice-"+UUID.randomUUID()+".wav");int length=0;try(RandomAccessFile output=new RandomAccessFile(file,"rw")){output.write(new byte[44]);byte[] bytes=new byte[buffer];long deadline=System.currentTimeMillis()+Math.min(duration,60000);while(recording&&System.currentTimeMillis()<deadline){int n=device.read(bytes,0,bytes.length);if(n<0)throw new Exception("麦克风读取失败");if(n>0){output.write(bytes,0,n);length+=n;}}output.seek(0);writeWave(output,length);output.getFD().sync();recorderEvent("stop",new JSONObject().put("tempFilePath",pathFor(file)).put("duration",length*1000L/32000));}catch(Exception error){try{recorderEvent("error",object("errMsg",error.getMessage()));}catch(Exception ignored){}}finally{recording=false;try{device.stop();}catch(Exception ignored){}device.release();audio=null;}});
  }catch(Exception error){recording=false;if(audio!=null){audio.release();audio=null;}result(id,false,error.getMessage());}}
  private static void little(RandomAccessFile file,int value,int count)throws Exception{for(int i=0;i<count;i++)file.write((value>>(8*i))&255);}
  private static void writeWave(RandomAccessFile file,int size)throws Exception{file.writeBytes("RIFF");little(file,size+36,4);file.writeBytes("WAVEfmt ");little(file,16,4);little(file,1,2);little(file,1,2);little(file,16000,4);little(file,32000,4);little(file,2,2);little(file,16,2);file.writeBytes("data");little(file,size,4);}
  private void chooseImages(String id,int count){if(imageCall!=null){result(id,false,"正在选择图片，请先完成上一次操作");return;}imageCall=id;imageLimit=Math.max(1,Math.min(count,6));new AlertDialog.Builder(this).setTitle("添加图片").setItems(new String[]{"拍照","从相册选择"},(dialog,which)->{try{if(which==0){cameraFile=new File(new File(getCacheDir(),"media"),"camera-"+UUID.randomUUID()+".jpg");Uri uri=Uri.parse("content://"+getPackageName()+".photos/"+cameraFile.getName());Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);intent.putExtra(MediaStore.EXTRA_OUTPUT,uri);intent.setClipData(ClipData.newRawUri("photo",uri));intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(intent,302);}else{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("image/*");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,imageLimit>1);startActivityForResult(intent,301);}}catch(Exception error){String call=imageCall;imageCall=null;result(call,false,"无法打开相机或相册："+error.getMessage());}}).setOnCancelListener(dialog->{String call=imageCall;imageCall=null;result(call,false,"cancel");}).show();}
  @Override protected void onActivityResult(int request,int status,Intent data){super.onActivityResult(request,status,data);if(request!=301&&request!=302)return;String id=imageCall;imageCall=null;if(id==null)return;if(status!=RESULT_OK){result(id,false,"cancel");return;}int limit=imageLimit;File capture=cameraFile;io.execute(()->{try{JSONArray files=new JSONArray();if(request==302){if(capture==null||!capture.exists()||capture.length()==0)throw new Exception("没有取得照片，请重新拍摄");if(capture.length()>8*1024*1024)throw new Exception("单张照片不能超过8MB，请降低相机分辨率");files.put(new JSONObject().put("tempFilePath",pathFor(capture)).put("size",capture.length()));}else{if(data==null)throw new Exception("没有选中图片");int count=data.getClipData()!=null?Math.min(limit,data.getClipData().getItemCount()):1;for(int i=0;i<count;i++){Uri uri=data.getClipData()!=null?data.getClipData().getItemAt(i).getUri():data.getData();if(uri==null)continue;String type=getContentResolver().getType(uri);if(type==null||!Arrays.asList("image/jpeg","image/png","image/webp","image/gif").contains(type))throw new Exception("请选择JPG、PNG、WebP或GIF图片");String ext=type.equals("image/png")?".png":type.equals("image/webp")?".webp":type.equals("image/gif")?".gif":".jpg";byte[] bytes=readLimited(getContentResolver().openInputStream(uri),8*1024*1024);File target=new File(new File(getCacheDir(),"media"),"image-"+UUID.randomUUID()+ext);try(FileOutputStream out=new FileOutputStream(target)){out.write(bytes);}files.put(new JSONObject().put("tempFilePath",pathFor(target)).put("size",bytes.length));}}result(id,true,object("tempFiles",files));}catch(Exception error){result(id,false,error.getMessage());}});}
  private void compressImage(String id,JSONObject args){Bitmap bitmap=null,rotated=null;try{File source=localFile(args.getString("path"));BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(source.getPath(),bounds);if(bounds.outWidth<1||bounds.outHeight<1)throw new Exception("无法解码图片");BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>2200)options.inSampleSize*=2;bitmap=BitmapFactory.decodeFile(source.getPath(),options);if(bitmap==null)throw new Exception("图片读取失败");int orientation=new ExifInterface(source.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);Matrix transform=new Matrix();switch(orientation){case 2:transform.setScale(-1,1);break;case 3:transform.setRotate(180);break;case 4:transform.setScale(1,-1);break;case 5:transform.setRotate(90);transform.postScale(-1,1);break;case 6:transform.setRotate(90);break;case 7:transform.setRotate(270);transform.postScale(-1,1);break;case 8:transform.setRotate(270);break;default:break;}rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),transform,true);File target=new File(new File(getCacheDir(),"media"),"compressed-"+UUID.randomUUID()+".jpg");try(FileOutputStream output=new FileOutputStream(target)){if(!rotated.compress(Bitmap.CompressFormat.JPEG,Math.min(100,Math.max(50,args.optInt("quality",85))),output))throw new Exception("图片压缩失败");}result(id,true,object("tempFilePath",pathFor(target)));}catch(Exception error){result(id,false,error.getMessage());}finally{if(rotated!=null&&rotated!=bitmap)rotated.recycle();if(bitmap!=null)bitmap.recycle();}}
  @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("window.__androidBack && window.__androidBack()",null);else super.onBackPressed();}
  @Override protected void onPause(){super.onPause();if(web!=null)web.evaluateJavascript("window.__androidPause && window.__androidPause()",null);recording=false;}
  @Override protected void onResume(){super.onResume();if(web!=null)web.evaluateJavascript("window.__androidResume && window.__androidResume()",null);}
  @Override protected void onDestroy(){destroyed=true;recording=false;io.shutdownNow();if(web!=null){web.removeJavascriptInterface("AndroidBridge");web.destroy();web=null;}super.onDestroy();}
}
