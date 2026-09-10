package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.exception.AuthException;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.Optional;

/**
 * 把拦截器放进 request attribute 的 JwtUser 注入到 @CurrentUser 参数。
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && JwtUser.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        return Optional.ofNullable(webRequest.getAttribute(TokenInterceptor.ATTR_CURRENT_USER, RequestAttributes.SCOPE_REQUEST))
                .map(JwtUser.class::cast)
                .orElseThrow(() -> new AuthException(ApiEnum.TOKEN_EMPTY));
    }
}
