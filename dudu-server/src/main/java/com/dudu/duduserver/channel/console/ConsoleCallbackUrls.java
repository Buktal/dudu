package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.channel.ChannelRoutes;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;

/**
 * 服务端回调根地址；生产显式配置，空值仅采用服务端本机请求 origin，不信任客户端转发头。
 * origin 的构造（见 originOf）与校验（见 requireOrigin）在此单点维护。
 */
@Component
public class ConsoleCallbackUrls {
    private final String configuredBase;

    public ConsoleCallbackUrls(@Value("${dudu.channel.callback-base-url:}") String configuredBase) {
        this.configuredBase = configuredBase.trim();
        if (!this.configuredBase.isEmpty()) requireOrigin(this.configuredBase);
    }

    // 服务端本机请求的 origin（scheme://host[:port]，IPv6 主机加括号，默认端口省略）；
    // 只读服务端可见信息，不读取客户端转发头
    public static String originOf(HttpServletRequest request) {
        String scheme = request.getScheme();
        String host = request.getServerName();
        int port = request.getServerPort();
        boolean defaultPort = (port == 80 && "http".equals(scheme)) || (port == 443 && "https".equals(scheme));
        String hostText = host.contains(":") ? "[" + host + "]" : host;
        return scheme + "://" + hostText + (defaultPort ? "" : ":" + port);
    }

    public String callback(String requestOrigin, Long accountId) {
        return base(requestOrigin) + ChannelRoutes.callbackPath(accountId);
    }

    public boolean localFallback() {
        return configuredBase.isEmpty();
    }

    public boolean meituanAvailable(String requestOrigin) {
        URI origin = requireOrigin(base(requestOrigin));
        int port = origin.getPort() < 0 ? 80 : origin.getPort();
        return !configuredBase.isEmpty() && "http".equals(origin.getScheme()) && (port == 80 || port == 8080);
    }

    private String base(String requestOrigin) {
        String base = configuredBase.isEmpty() ? requestOrigin : configuredBase;
        return requireOrigin(base).toString();
    }

    private URI requireOrigin(String value) {
        try {
            URI uri = URI.create(value);
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty()) || uri.getPort() > 65535) {
                throw new IllegalArgumentException();
            }
            return uri;
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("回调根地址只允许 http/https 的 scheme、host 和可选 port");
        }
    }
}
