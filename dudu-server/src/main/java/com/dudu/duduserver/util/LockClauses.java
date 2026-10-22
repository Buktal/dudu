package com.dudu.duduserver.util;

/**
 * 行锁片段单点：MP last() 追加的锁定读（FOR UPDATE）绕过可重复读快照，读到并发事务已
 * 提交的最新行。片段不含用户输入，禁止脱离调用方业务事务使用；各调用处的锁序说明留在
 * 各自服务（描述各自路径），此处只收敛片段本身。
 */
public final class LockClauses {

    // 锁定读片段：锁定读绕过可重复读快照，读到并发事务已提交的最新行
    public static final String LOCK_ROW = "FOR UPDATE";

    private LockClauses() {
    }
}
