package com.dudu.duduserver.config.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * 直接解析 Authorization，将强类型载荷注入 @Me 参数，不保存请求身份状态。
 */
@Component
@RequiredArgsConstructor
public class MeResolver implements HandlerMethodArgumentResolver {

    private final JwtManager jwtManager;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(Me.class)
            && JwtUser.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(@NonNull MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        return jwtManager.parseAuthorization(webRequest.getHeader(HttpHeaders.AUTHORIZATION));
    }
}
