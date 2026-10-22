package cn.neichusi.app;
import java.net.URL;

public final class RequestPolicyTest {
  private static int count;
  private static void check(boolean value){if(!value)throw new AssertionError("Policy case "+count);count++;}
  private static void denied(String address,String method)throws Exception{try{RequestPolicy.isPublic(new URL(address),method);throw new AssertionError("Unexpectedly allowed "+address);}catch(SecurityException expected){count++;}}
  public static void main(String[] args)throws Exception{
    for(String domain:new String[]{"xhslink.cn","xhslink.com","www.xiaohongshu.com","www.xiachufang.com","www.douguo.com","home.meishichina.com"}){
      check(RequestPolicy.isPublic(new URL("https://"+domain+"/public"),"GET"));denied("https://"+domain+"/public","POST");
    }
    for(String domain:new String[]{"api.xiaomimimo.com","api.deepseek.com","dashscope.aliyuncs.com"})check(!RequestPolicy.isPublic(new URL("https://"+domain+"/v1/chat/completions"),"POST"));
    for(String address:new String[]{"http://xhslink.cn/o/test","https://user:pass@xhslink.cn/o/test","https://xhslink.cn:444/o/test","https://xhslink.cn.evil.test/","https://evil-xhslink.cn/","https://127.0.0.1/","https://192.168.1.1/","https://open.weixin.qq.com/connect/oauth2/authorize","https://api.xiaomimimo.com.evil.test/v1"})denied(address,"GET");
    denied("https://xhslink.cn/","DELETE");
    for(String header:new String[]{"Authorization","authorization","Cookie","cookie","Api-Key","X-Api-Key","Proxy-Authorization"})check(!RequestPolicy.headerAllowed(true,header));
    check(RequestPolicy.headerAllowed(true,"User-Agent"));check(RequestPolicy.headerAllowed(true,"Accept"));check(RequestPolicy.headerAllowed(false,"Authorization"));check(!RequestPolicy.headerAllowed(false,"Cookie"));check(!RequestPolicy.headerAllowed(false,"User-Agent"));
    System.out.println("PASS: "+count+" native policy assertions");
  }
}
