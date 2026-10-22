package com.dudu.duduserver.service.impl;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Desk 写路径推送的事务后置与静默兜底单点：推送在事务提交后执行（读侧与会话查询一致、
 * 回滚不产生通知），无事务的自动提交写入立即执行；推送异常只记录，不回滚也不打扰写结果。
 * 管理端关系写入的 access-changed 走 ApplicationEvent 收敛（DeskSocketGateway 的事务监听），
 * 不经本类。
 */
@Slf4j
@Component
public class PushGate {

    // 事务内注册到提交后执行，无事务时立即执行
    public void afterCommitOrNow(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }

    // 静默推送：失败只记录，context 携带推送内容与定位参数
    public void pushQuietly(String context, Runnable push) {
        try {
            push.run();
        } catch (RuntimeException e) {
            log.error("[push] 推送失败, context={}", context, e);
        }
    }

    // 事务提交后（无事务立即）静默推送：写路径推送的完整编排
    public void afterCommitQuietly(String context, Runnable push) {
        afterCommitOrNow(() -> pushQuietly(context, push));
    }
}
