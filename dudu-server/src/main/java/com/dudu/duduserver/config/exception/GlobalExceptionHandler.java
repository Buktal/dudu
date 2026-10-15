package com.dudu.duduserver.config.exception;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.constant.ApiEnum;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常处理器：应用层响应 HTTP 恒 200（#6 决策），业务语义由 R.code 表达；
 * 路由层 404/405 例外走真实状态码（见下方窄 handler 注释）。
 * 业务异常记 warn 不带栈；未知异常记 error 带栈。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public R<Void> onBiz(BizException e) {
        log.warn("[biz] 业务请求失败, code={}, message={}", e.apiEnum().code, e.getMessage());
        return R.err(e.apiEnum(), e.getMessage());
    }

    @ExceptionHandler(BindException.class)
    public R<Void> onBind(BindException e) {
        String msg = e.getAllErrors().stream()
            .findFirst()
            .map(MessageSourceResolvable::getDefaultMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public R<Void> onMethodValidation(HandlerMethodValidationException e) {
        String msg = e.getParameterValidationResults().stream()
            .flatMap(result -> result.getResolvableErrors().stream())
            .findFirst()
            .map(MessageSourceResolvable::getDefaultMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public R<Void> onConstraintViolation(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
            .findFirst()
            .map(ConstraintViolation::getMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public R<Void> onBodyUnreadable(HttpMessageNotReadableException e) {
        log.warn("[param] 请求体不可读, exception={}", e.getClass().getSimpleName());
        return R.err(ApiEnum.PARAM_ERROR, "请求体不可读");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public R<Void> onMissingParam(MissingServletRequestParameterException e) {
        return R.err(ApiEnum.PARAM_MISSING, "缺少参数 " + e.getParameterName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public R<Void> onTypeMismatch(MethodArgumentTypeMismatchException e) {
        return R.err(ApiEnum.PARAM_ERROR, "参数 " + e.getName() + " 类型错误");
    }

    // 路由层错误（未匹配路径）不属 #6「恒 200」的应用层范围：请求未进入任何控制器即失败，
    // R 信封无业务语义可表达，按 ErrorResponse 状态码（404）原样返回，同渠道回调先例；不刷 error 日志
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> onNoResourceFound(NoResourceFoundException e) {
        return ResponseEntity.status(e.getStatusCode()).build();
    }

    // 同上：路径匹配但 HTTP 方法不匹配属路由层错误，按真实状态码（405）返回
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Void> onMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(e.getStatusCode()).build();
    }

    @ExceptionHandler(Exception.class)
    public R<Void> onUnknown(Exception e) {
        log.error("[unknown] 请求处理失败", e);
        return R.err(ApiEnum.UNKNOWN);
    }
}
