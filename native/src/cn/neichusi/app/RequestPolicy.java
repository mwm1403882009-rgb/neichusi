package cn.neichusi.app;

import java.net.URL;
import java.util.Arrays;
import java.util.Locale;

// Public recipe reads and authenticated model requests have separate trust boundaries.
final class RequestPolicy {
  private static final String[] MODELS={"api.deepseek.com","api.xiaomimimo.com","token-plan-cn.xiaomimimo.com","token-plan-sgp.xiaomimimo.com","token-plan-ams.xiaomimimo.com","api.moonshot.cn","open.bigmodel.cn","tokenhub.tencentmaas.com","api.hunyuan.cloud.tencent.com","dashscope.aliyuncs.com","dashscope-intl.aliyuncs.com","cn-hongkong.dashscope.aliyuncs.com","maas.aliyuncs.com"};
  private static final String[] PUBLIC={"xiaohongshu.com","xhslink.cn","xhslink.com","xiachufang.com","douguo.com","meishichina.com"};
  private static boolean matches(String host,String[] domains){for(String domain:domains)if(host.equals(domain)||host.endsWith("."+domain))return true;return false;}
  static boolean isPublic(URL url,String method){
    if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||url.getPort()!=-1&&url.getPort()!=443)throw new SecurityException("只允许无凭据的HTTPS地址与标准端口");
    if(!"GET".equals(method)&&!"POST".equals(method))throw new SecurityException("不支持的请求方法");
    String host=url.getHost().toLowerCase(Locale.ROOT);
    if(matches(host,MODELS))return false;
    if(matches(host,PUBLIC)){if(!"GET".equals(method))throw new SecurityException("公开菜谱仅支持只读GET请求");return true;}
    throw new SecurityException("该地址不在支持的模型或公开菜谱名单中");
  }
  static boolean headerAllowed(boolean publicRead,String header){
    String key=header.toLowerCase(Locale.ROOT);
    return publicRead?Arrays.asList("user-agent","accept","accept-language").contains(key):Arrays.asList("authorization","content-type","api-key","x-api-key").contains(key);
  }
}
