package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.LinkedMultiValueMap;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 权限变更与工作区清理在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：
 * 管理端改变员工-组 / 账号-组关系后向本企业全部已连接员工推送 access-changed（跨企业不推送），
 * 迁组后原组员工读取、写入、状态与媒体一律 10106 且不再收到推送，新组员工看到同一份历史
 * （访客与消息不复制），初始管理员、普通管理员、多组员工与跨企业边界沿用现有规则，
 * 无外键的脏成员 / 脏账号关联不泄漏数据。通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskAccessIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 794001L;
    private static final long OTHER_COMPANY_ID = 794002L;
    private static final long DIRTY_VISITOR_ID = 794101L;
    private static final String CALLBACK_TOKEN = "access-callback-token";
    private static final String OTHER_CALLBACK_TOKEN = "other-callback-token";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @Autowired PlatformTransactionManager transactionManager;

    private long moveOldGroup;
    private long moveNewGroup;
    private long moveChannel;
    private long leaveGroup;
    private long leaveChannel;
    private long grantGroup;
    private long grantChannel;
    private long multiFirst;
    private long multiSecond;
    private long multiChannel;
    private long otherGroup;
    private long otherChannel;
    private long dirtyChannel;

    private UserDO moveOld;
    private UserDO moveNew;
    private UserDO multi;
    private UserDO leaver;
    private UserDO granted;
    private UserDO noAccess;
    private UserGroupMemberDO leaverMember;

    private String ownerToken;
    private String moveOldToken;
    private String moveNewToken;
    private String leaverToken;
    private String grantedToken;
    private String multiToken;
    private String noAccessToken;
    private String otherToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "accessowner", "权限验收企业"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "otherowner", "权限验收企业"), 1L);

        // 账号换组场景：账号随组迁移，原组与新组各有一名只属于该组的员工
        UserGroupDO oldGroup = group(COMPANY_ID, "迁出组");
        UserGroupDO newGroup = group(COMPANY_ID, "迁入组");
        moveOldGroup = oldGroup.getGroupId();
        moveNewGroup = newGroup.getGroupId();
        moveChannel = channel(COMPANY_ID, moveOldGroup, ChannelEnum.WECHAT_MP, "迁组公众号", CALLBACK_TOKEN);
        moveOld = plainUser(COMPANY_ID, "access.move.old");
        moveNew = plainUser(COMPANY_ID, "access.move.new");
        members.save(member(COMPANY_ID, moveOld.getUserId(), moveOldGroup));
        members.save(member(COMPANY_ID, moveNew.getUserId(), moveNewGroup));

        // 员工退组场景：同一组里的两名员工，退组只影响其中一人
        UserGroupDO leaving = group(COMPANY_ID, "退组组");
        leaveGroup = leaving.getGroupId();
        leaveChannel = channel(COMPANY_ID, leaveGroup, ChannelEnum.WECHAT_MP, "退组公众号", "leave-callback-token");
        leaver = plainUser(COMPANY_ID, "access.leaver");
        leaverMember = member(COMPANY_ID, leaver.getUserId(), leaveGroup);
        members.save(leaverMember);
        UserDO keeper = plainUser(COMPANY_ID, "access.keeper");
        members.save(member(COMPANY_ID, keeper.getUserId(), leaveGroup));

        // 增权场景：初始没有组的员工，加入新组后可见新组数据
        UserGroupDO granting = group(COMPANY_ID, "增权组");
        grantGroup = granting.getGroupId();
        grantChannel = channel(COMPANY_ID, grantGroup, ChannelEnum.WECHAT_MP, "增权公众号", "grant-callback-token");
        granted = plainUser(COMPANY_ID, "access.granted");

        // 多组员工：两个组都加入，账号在组间迁移不影响其权限
        UserGroupDO first = group(COMPANY_ID, "多组一");
        UserGroupDO second = group(COMPANY_ID, "多组二");
        multiFirst = first.getGroupId();
        multiSecond = second.getGroupId();
        multiChannel = channel(COMPANY_ID, multiSecond, ChannelEnum.WECHAT_MP, "多组公众号", "multi-callback-token");
        multi = plainUser(COMPANY_ID, "access.multi");
        members.save(member(COMPANY_ID, multi.getUserId(), multiFirst));
        members.save(member(COMPANY_ID, multi.getUserId(), multiSecond));

        // 无成员关系的普通员工与跨企业员工：始终没有接待范围
        noAccess = plainUser(COMPANY_ID, "access.none");
        UserGroupDO foreign = group(OTHER_COMPANY_ID, "他企业组");
        otherGroup = foreign.getGroupId();
        otherChannel = channel(OTHER_COMPANY_ID, otherGroup, ChannelEnum.WECHAT_MP, "他企业公众号", OTHER_CALLBACK_TOKEN);
        UserDO otherUser = plainUser(OTHER_COMPANY_ID, "access.other");
        members.save(member(OTHER_COMPANY_ID, otherUser.getUserId(), otherGroup));

        // 无外键的脏关联：本企业账号挂在其他企业的组上，任何授权范围都不能放行
        dirtyChannel = channel(COMPANY_ID, otherGroup, ChannelEnum.WECHAT_MP, "脏账号", "dirty-callback-token");

        ownerToken = login(COMPANY_ID, "accessowner");
        moveOldToken = login(COMPANY_ID, "access.move.old");
        moveNewToken = login(COMPANY_ID, "access.move.new");
        leaverToken = login(COMPANY_ID, "access.leaver");
        grantedToken = login(COMPANY_ID, "access.granted");
        multiToken = login(COMPANY_ID, "access.multi");
        noAccessToken = login(COMPANY_ID, "access.none");
        otherToken = login(OTHER_COMPANY_ID, "access.other");
    }

    @Test
    void accountMoveNotifiesCompanyClientsAndMovesScopeWithHistoryKeptOnce() throws Exception {
        SocketClient owner = connectAndAuth(ownerToken);
        SocketClient leaving = connectAndAuth(moveOldToken);
        SocketClient arriving = connectAndAuth(moveNewToken);
        SocketClient foreign = connectAndAuth(otherToken);

        // 原组账号的来信只推给当时有权的员工，形成迁组前的历史
        callback(moveChannel, CALLBACK_TOKEN, textPush("gh_access", "access-ext-1", "第一条", "am-1"));
        Long visitorId = visitorIdOf("access-ext-1");
        assertThat(frameType(owner.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat(frameType(leaving.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat((Object) arriving.next(Duration.ofMillis(700))).isNull();
        long imageMessageId = imagePush(visitorId);
        assertThat(countMessages(visitorId)).isEqualTo(2);
        assertThat(frameType(owner.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat(frameType(leaving.next(Duration.ofSeconds(5)))).isEqualTo("message");

        // 管理端把账号改到新组：沿用现有写入口，操作本身不变
        CompanyChannelDO patch = new CompanyChannelDO();
        patch.setCompanyChannelId(moveChannel);
        patch.setGroupId(moveNewGroup);
        assertThat(channels.updateById(patch)).isTrue();
        assertThat(channels.getById(moveChannel).getGroupId()).isEqualTo(moveNewGroup);

        // 本企业全部已连接员工（含迁出员工）收到 access-changed；跨企业连接不收到
        assertAccessChanged(owner);
        assertAccessChanged(leaving);
        assertAccessChanged(arriving);
        assertThat((Object) foreign.next(Duration.ofMillis(700))).isNull();
        // 他企业自己人的推送仍然到达，证明上一条是「没有发送」而不是连接失效
        callback(otherChannel, OTHER_CALLBACK_TOKEN, textPush("gh_other", "other-ext-1", "他企业来信", "om-1"));
        assertThat(frameType(foreign.next(Duration.ofSeconds(5)))).isEqualTo("message");

        // 新组员工重查身份与列表：同一份历史随当前权限可见，访客与消息没有复制
        JSONObject arrivingAccess = access(moveNewToken);
        assertThat(accountIds(arrivingAccess)).containsExactly(String.valueOf(moveChannel));
        JSONObject page = query(moveNewToken, "access-ext-1");
        assertThat(page.getLong("total")).isEqualTo(1L);
        assertThat(page.getJSONArray("items").getJSONObject(0).getStr("id")).isEqualTo(String.valueOf(visitorId));
        JSONObject history = history(moveNewToken, visitorId);
        assertThat(history.getJSONArray("items")).hasSize(2);
        assertThat(history.getJSONArray("items").getJSONObject(0).getStr("id")).isNotBlank();
        assertThat(visitorIdOf("access-ext-1")).isEqualTo(visitorId);
        assertThat(countVisitors("access-ext-1")).isEqualTo(1);
        assertThat(countMessages(visitorId)).isEqualTo(2);

        // 原组员工失去读取、写入、状态、名片与媒体权限；令牌仍有效但接待范围为空
        assertThat(accountIds(access(moveOldToken))).isEmpty();
        assertThat(query(moveOldToken, "access-ext-1").getLong("total")).isZero();
        assertThat(code(getVisitor(moveOldToken, visitorId))).isEqualTo(10106);
        assertThat(code(historyResponse(moveOldToken, visitorId))).isEqualTo(10106);
        assertThat(code(sendText(moveOldToken, visitorId, "越权回复", "am-2"))).isEqualTo(10106);
        assertThat(code(readProfile(moveOldToken, visitorId))).isEqualTo(10106);
        assertThat(code(saveProfile(moveOldToken, visitorId))).isEqualTo(10106);
        assertThat(code(capability(moveOldToken, visitorId))).isEqualTo(10106);
        assertThat(code(media(moveOldToken, imageMessageId))).isEqualTo(10106);
        // 新组员工的同一素材读取已越过权限边界，按渠道凭据未配置如实返回 12200
        assertThat(code(media(moveNewToken, imageMessageId))).isEqualTo(12200);

        // Socket 推送前按当前权限复核：迁出后原组连接不再收到该账号的任何推送
        callback(moveChannel, CALLBACK_TOKEN, textPush("gh_access", "access-ext-1", "迁组后来信", "am-3"));
        assertThat(frameType(arriving.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat(frameType(owner.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat((Object) leaving.next(Duration.ofMillis(700))).isNull();
    }

    @Test
    void employeeLeavingGroupStopsPushesAndDeniesReadsAndWrites() throws Exception {
        SocketClient owner = connectAndAuth(ownerToken);
        SocketClient leaver = connectAndAuth(leaverToken);
        SocketClient keeper = connectAndAuth(login(COMPANY_ID, "access.keeper"));

        callback(leaveChannel, "leave-callback-token", textPush("gh_leave", "access-ext-2", "退组前来信", "lm-1"));
        Long visitorId = visitorIdOf("access-ext-2");
        assertThat(frameType(leaver.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat(frameType(keeper.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat(frameType(owner.next(Duration.ofSeconds(5)))).isEqualTo("message");

        // 员工退组：删除现有成员关系
        assertThat(members.removeById(leaverMember.getMemberId())).isTrue();

        // 收权通知发给本企业全部已连接员工，退组员工自己也收到以便清理工作区
        assertAccessChanged(leaver);
        assertAccessChanged(keeper);
        assertAccessChanged(owner);

        // 查询与写入一律拒绝，列表按当前范围为空
        assertThat(accountIds(access(leaverToken))).isEmpty();
        assertThat(query(leaverToken, "access-ext-2").getLong("total")).isZero();
        assertThat(code(getVisitor(leaverToken, visitorId))).isEqualTo(10106);
        assertThat(code(historyResponse(leaverToken, visitorId))).isEqualTo(10106);
        assertThat(code(sendText(leaverToken, visitorId, "越权回复", "lm-2"))).isEqualTo(10106);
        assertThat(code(updateStatus(leaverToken, visitorId, "closed"))).isEqualTo(10106);

        callback(leaveChannel, "leave-callback-token", textPush("gh_leave", "access-ext-2", "退组后来信", "lm-3"));
        assertThat(frameType(keeper.next(Duration.ofSeconds(5)))).isEqualTo("message");
        assertThat((Object) leaver.next(Duration.ofMillis(700))).isNull();
    }

    @Test
    void grantedMemberSeesNewScopeAndReceivesAccessChanged() throws Exception {
        SocketClient grantedClient = connectAndAuth(grantedToken);
        SocketClient owner = connectAndAuth(ownerToken);

        callback(grantChannel, "grant-callback-token", textPush("gh_grant", "access-ext-3", "增权前来信", "gm-1"));
        Long visitorId = visitorIdOf("access-ext-3");
        assertThat(accountIds(access(grantedToken))).isEmpty();
        assertThat(query(grantedToken, "access-ext-3").getLong("total")).isZero();
        assertThat(code(getVisitor(grantedToken, visitorId))).isEqualTo(10106);
        assertThat((Object) grantedClient.next(Duration.ofMillis(700))).isNull();
        assertThat(frameType(owner.next(Duration.ofSeconds(5)))).isEqualTo("message");

        assertThat(members.save(member(COMPANY_ID, granted.getUserId(), grantGroup))).isTrue();

        assertAccessChanged(grantedClient);
        assertAccessChanged(owner);

        // 增权后新组数据可见，历史仍是增权前那份
        assertThat(accountIds(access(grantedToken))).containsExactly(String.valueOf(grantChannel));
        JSONObject page = query(grantedToken, "access-ext-3");
        assertThat(page.getLong("total")).isEqualTo(1L);
        assertThat(page.getJSONArray("items").getJSONObject(0).getStr("id")).isEqualTo(String.valueOf(visitorId));
        assertThat(history(grantedToken, visitorId).getJSONArray("items")).hasSize(1);
    }

    @Test
    void initialAdminNormalAdminMultiGroupAndCrossCompanyFollowCurrentMembership() throws Exception {
        // 初始管理员拥有本企业全部组：本用例自建组与账号，不依赖其他用例的迁移结果
        UserGroupDO adminGroup = group(COMPANY_ID, "管理员组");
        long adminChannel = channel(COMPANY_ID, adminGroup.getGroupId(), ChannelEnum.WECHAT_MP, "管理员公众号",
            "admin-callback-token");
        assertThat(access(ownerToken).getBool("allGroups")).isTrue();
        assertThat(accountIds(access(ownerToken))).contains(String.valueOf(adminChannel));

        // 普通管理员没有成员关系就没有接待范围，加入组后按当前关系可见
        UserDO normalAdmin = adminUser(COMPANY_ID, "access.admin");
        String adminToken = login(COMPANY_ID, "access.admin");
        assertThat(access(adminToken).getBool("allGroups")).isFalse();
        assertThat(accountIds(access(adminToken))).isEmpty();
        assertThat(query(adminToken, "access-ext-5").getLong("total")).isZero();
        members.save(member(COMPANY_ID, normalAdmin.getUserId(), adminGroup.getGroupId()));
        assertThat(accountIds(access(adminToken))).containsExactly(String.valueOf(adminChannel));

        // 多组员工：账号在其两个所属组之间迁移，权限不中断
        SocketClient multiClient = connectAndAuth(multiToken);
        callback(multiChannel, "multi-callback-token", textPush("gh_multi", "access-ext-4", "多组来信", "mm-1"));
        Long visitorId = visitorIdOf("access-ext-4");
        assertThat(frameType(multiClient.next(Duration.ofSeconds(5)))).isEqualTo("message");
        CompanyChannelDO patch = new CompanyChannelDO();
        patch.setCompanyChannelId(multiChannel);
        patch.setGroupId(multiFirst);
        assertThat(channels.updateById(patch)).isTrue();
        assertAccessChanged(multiClient);
        assertThat(accountIds(access(multiToken))).containsExactly(String.valueOf(multiChannel));
        assertThat(code(getVisitor(multiToken, visitorId))).isZero();

        // 跨企业：他企业员工读不到本企业访客，也没有本企业范围
        assertThat(accountIds(access(otherToken))).containsExactly(String.valueOf(otherChannel));
        assertThat(code(getVisitor(otherToken, visitorId))).isEqualTo(10106);
        assertThat(query(otherToken, "access-ext-4").getLong("total")).isZero();
        assertThat(accountIds(access(noAccessToken))).isEmpty();
    }

    @Test
    void accessChangedNotificationFollowsTransactionOutcome() throws Exception {
        SocketClient owner = connectAndAuth(ownerToken);
        UserGroupDO txGroup = group(COMPANY_ID, "事务组");
        UserDO txMember = plainUser(COMPANY_ID, "access.tx");
        String txToken = login(COMPANY_ID, "access.tx");

        // 事务回滚：成员关系与范围变更事件一起回滚，不产生任何推送，员工范围也不含该组
        new TransactionTemplate(transactionManager).execute(status -> {
            members.save(member(COMPANY_ID, txMember.getUserId(), txGroup.getGroupId()));
            status.setRollbackOnly();
            return null;
        });
        assertThat((Object) owner.next(Duration.ofMillis(700))).isNull();
        assertThat(groupIds(access(txToken))).doesNotContain(String.valueOf(txGroup.getGroupId()));

        // 事务提交：提交后才收敛为 access-changed 报文，员工范围随之包含该组
        new TransactionTemplate(transactionManager).execute(status -> {
            members.save(member(COMPANY_ID, txMember.getUserId(), txGroup.getGroupId()));
            return null;
        });
        assertAccessChanged(owner);
        assertThat(groupIds(access(txToken))).contains(String.valueOf(txGroup.getGroupId()));
    }

    @Test
    void dirtyRelationsWithoutForeignKeysDoNotLeakAccessOrData() throws Exception {
        // 脏成员关系：本企业员工被声明属于其他企业的组，仍不获得任何范围
        members.save(member(COMPANY_ID, noAccess.getUserId(), otherGroup));
        assertThat(accountIds(access(noAccessToken))).isEmpty();
        assertThat(query(noAccessToken, "access-ext-4").getLong("total")).isZero();

        // 脏账号与访客：本企业账号挂在其他企业的组上，任何模板都不可见（初始管理员也不例外）
        assertThat(accountIds(access(ownerToken))).doesNotContain(String.valueOf(dirtyChannel));
        insertDirtyVisitor();
        assertThat(query(ownerToken, "dirty-ext-1").getLong("total")).isZero();
        assertThat(code(getVisitor(ownerToken, DIRTY_VISITOR_ID))).isEqualTo(10106);
        assertThat(code(historyResponse(ownerToken, DIRTY_VISITOR_ID))).isEqualTo(10106);
    }

    private void insertDirtyVisitor() {
        jdbc.update("INSERT INTO visitor(visitor_id, company_id, company_channel_id, external_user_id, name, status,"
                + " last_message_preview, last_message_time, waiting_since, message_count, version, create_time, update_time)"
                + " VALUES(?, ?, ?, 'dirty-ext-1', NULL, 'needs-reply', '', NULL, NULL, 0, 1, NOW(3), NOW(3))",
            DIRTY_VISITOR_ID, COMPANY_ID, dirtyChannel);
        jdbc.update("INSERT INTO visitor_profile(visitor_id, channel_fields, tags, note, version, create_time, update_time)"
            + " VALUES(?, JSON_ARRAY(), JSON_ARRAY(), '', 1, NOW(3), NOW(3))", DIRTY_VISITOR_ID);
    }

    // 只有渠道素材标识、没有公开链接的图片来信：媒体接口必须交由渠道边界处理
    private long imagePush(Long visitorId) throws Exception {
        assertThat(callback(moveChannel, CALLBACK_TOKEN, """
            <xml><ToUserName><![CDATA[gh_access]]></ToUserName><FromUserName><![CDATA[access-ext-1]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[image]]></MsgType>
            <MediaId><![CDATA[media-access-1]]></MediaId><MsgId>am-image-1</MsgId></xml>
            """.formatted(DateUtil.currentSeconds()))).isEqualTo(200);
        return jdbc.queryForObject(
            "SELECT MAX(message_id) FROM message WHERE visitor_id = ?", Long.class, visitorId);
    }

    private void assertAccessChanged(SocketClient client) throws Exception {
        JSONObject frame = client.next(Duration.ofSeconds(5));
        assertThat((Object) frame).isNotNull();
        assertThat(frame.getStr("type")).isEqualTo("access-changed");
    }

    private String frameType(JSONObject frame) {
        return frame == null ? null : frame.getStr("type");
    }

    private long visitorIdOf(String externalUserId) {
        Long id = jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = ?", Long.class,
            COMPANY_ID, externalUserId);
        assertThat(id).isNotNull();
        return id;
    }

    private long countVisitors(String externalUserId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM visitor WHERE external_user_id = ?", Long.class,
            externalUserId);
    }

    private long countMessages(Long visitorId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM message WHERE visitor_id = ?", Long.class, visitorId);
    }

    private JSONObject access(String token) throws Exception {
        return data(JSONUtil.parseObj(deskGet(token, "/api/desk/profile"))).getJSONObject("access");
    }

    // 接待范围里的组 ID（Desk 契约为十进制字符串）
    private List<String> groupIds(JSONObject access) {
        return access.getJSONArray("groups").stream()
            .map(item -> ((JSONObject) item).getStr("groupId")).toList();
    }

    private JSONObject query(String token, String search) throws Exception {
        return data(JSONUtil.parseObj(deskPost(token, "/api/desk/visitors/query",
            "{\"search\": \"%s\"}".formatted(search))));
    }

    private JSONObject history(String token, Long visitorId) throws Exception {
        return data(JSONUtil.parseObj(historyResponse(token, visitorId)));
    }

    private String historyResponse(String token, Long visitorId) throws Exception {
        return deskGet(token, "/api/desk/visitors/" + visitorId + "/messages");
    }

    private String getVisitor(String token, Long visitorId) throws Exception {
        return deskGet(token, "/api/desk/visitors/" + visitorId);
    }

    private String readProfile(String token, Long visitorId) throws Exception {
        return deskGet(token, "/api/desk/visitors/" + visitorId + "/profile");
    }

    private String sendText(String token, Long visitorId, String text, String clientRequestId) throws Exception {
        return deskPost(token, "/api/desk/visitors/" + visitorId + "/messages",
            "{\"clientRequestId\": \"%s\", \"text\": \"%s\"}".formatted(clientRequestId, text));
    }

    private String saveProfile(String token, Long visitorId) throws Exception {
        return deskPut(token, "/api/desk/visitors/" + visitorId + "/profile",
            "{\"tags\": [\"越权\"], \"note\": \"越权\"}");
    }

    private String capability(String token, Long visitorId) throws Exception {
        return deskGet(token, "/api/desk/visitors/" + visitorId + "/capability");
    }

    private String updateStatus(String token, Long visitorId, String status) throws Exception {
        return deskPut(token, "/api/desk/visitors/" + visitorId + "/status",
            "{\"status\": \"%s\"}".formatted(status));
    }

    private String media(String token, long messageId) throws Exception {
        return deskGet(token, "/api/desk/messages/" + messageId + "/media");
    }

    private int callback(long channelId, String token, String body) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback").params(queryParams(token))
                .contentType(MediaType.valueOf("text/xml")).content(body))
            .andReturn().getResponse().getStatus();
    }

    private LinkedMultiValueMap<String, String> queryParams(String token) {
        Map<String, String> params = new java.util.HashMap<>();
        String timestamp = String.valueOf(DateUtil.currentSeconds());
        String nonce = "nonce-" + System.nanoTime();
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        params.put("timestamp", timestamp);
        params.put("nonce", nonce);
        params.put("signature", DigestUtil.sha1Hex(String.join("", parts)));
        LinkedMultiValueMap<String, String> query = new LinkedMultiValueMap<>();
        params.forEach(query::add);
        return query;
    }
}
